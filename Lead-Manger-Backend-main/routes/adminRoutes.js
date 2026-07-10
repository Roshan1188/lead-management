// routes/admin.js
import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Lead, { BUSINESS_OPTIONS } from "../models/Lead.js";
import Followup from "../models/Followup.js";
import MetaConfig from "../models/MetaConfig.js";
import { protect, requireRole } from "../middleware/authMiddleware.js";
import { distributeLeads } from "../utils/leadDistributor.js";
import { getDayRange } from "../utils/date.js";
import { encryptText, decryptText } from "../utils/crypto.js";

const router = express.Router();
const { Types } = mongoose;

/* --------------------------- helpers --------------------------- */
const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";
const ACTIVE_STATUSES = ["initialize", "followup"];
const META_BASE = process.env.META_GRAPH_BASE || "https://graph.facebook.com/v24.0";

function parseRange(query, defDays = 30) {
  const to = query?.to ? new Date(query.to) : new Date();
  const from = query?.from ? new Date(query.from) : new Date(Date.now() - defDays * 86400000);
  return { from, to };
}
const clampInt = (v, def, min, max) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
};
const toObjectId = (val) => {
  if (!val) return null;
  if (!Types.ObjectId.isValid(String(val))) return null;
  return new Types.ObjectId(String(val));
};

const normalizeClientInterest = (val) => {
  if (!val) return undefined;
  const v = String(val).trim();
  if (!v) return undefined;
  const options = [
    "Construction",
    "Interior",
    "Renovation",
    "Modular Kitchen",
    "Interior Designing/Architectural Planning",
  ];
  if (options.includes(v)) return v;
  const lower = v.toLowerCase();
  const found = options.find((opt) => opt.toLowerCase() === lower);
  return found || undefined;
};

function normalizeBusiness(val) {
  const v = String(val || "").trim();
  return BUSINESS_OPTIONS.includes(v) ? v : null;
}

async function getMetaConfigDoc(business) {
  return MetaConfig.findOne({ business });
}

function decryptMetaToken(doc) {
  if (!doc?.accessTokenEnc) return null;
  return decryptText({
    enc: doc.accessTokenEnc,
    iv: doc.accessTokenIv,
    tag: doc.accessTokenTag,
  });
}

async function metaFetch(path, token, params = {}) {
  if (!token) throw new Error("Meta access token missing");
  const url = new URL(`${META_BASE}/${path}`);
  url.searchParams.set("access_token", token);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Meta API error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function getPageAccessToken(pageId, userToken) {
  if (!pageId) return null;
  try {
    const data = await metaFetch(`${pageId}`, userToken, { fields: "access_token" });
    return data?.access_token || null;
  } catch {
    return null;
  }
}

async function getAllLeadgenForms(pageId, token) {
  if (!pageId) return [];
  const forms = [];
  let after = null;

  do {
    const data = await metaFetch(`${pageId}/leadgen_forms`, token, {
      fields: "id,name,status,locale",
      limit: 200,
      after,
    });
    const rows = Array.isArray(data?.data) ? data.data : [];
    rows.forEach((f) => {
      if (!f?.id) return;
      forms.push({
        id: String(f.id),
        name: f?.name ? String(f.name) : null,
      });
    });
    after = data?.paging?.cursors?.after || null;
  } while (after);

  return forms;
}

async function getPrimaryTelecallerId(business) {
  if (business === "doonearth") {
    const doc = await getMetaConfigDoc("doonearth");
    return doc?.restrictedTelecallerId || null;
  }
  const telecaller = await User.findOne({ role: 1, blocked: { $ne: true } })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id")
    .lean();
  return telecaller?._id || null;
}

async function syncMetaLeads({
  business,
  formId: bodyFormId,
  limit,
  after,
  actorUserId = null,
  forceAssignToPrimaryTelecaller = true,
} = {}) {
  const doc = await getMetaConfigDoc(business);
  const token = decryptMetaToken(doc);

  const pageToken = await getPageAccessToken(doc?.pageId, token);
  const useToken = pageToken || token;

  const explicitFormId = String(bodyFormId || "").trim();
  let targetForms = [];
  if (explicitFormId) {
    let explicitFormName = null;
    if (doc?.pageId) {
      try {
        const pageForms = await getAllLeadgenForms(String(doc.pageId), useToken);
        const matched = pageForms.find((f) => String(f.id) === explicitFormId);
        explicitFormName = matched?.name || null;
      } catch {
        // keep sync resilient even if form-name lookup fails
      }
    }
    targetForms = [{ id: explicitFormId, name: explicitFormName }];
  } else if (doc?.pageId) {
    targetForms = await getAllLeadgenForms(String(doc.pageId), useToken);
  } else if (doc?.formId) {
    targetForms = [{ id: String(doc.formId), name: null }];
  }

  if (!targetForms.length) {
    throw new Error("formId or pageId with forms required");
  }

  // Backfill old records with known form names so UI can show names instead of form IDs.
  const namedForms = targetForms.filter((f) => f?.id && f?.name);
  if (namedForms.length) {
    await Promise.all(
      namedForms.map((f) =>
        Lead.updateMany(
          { leadType: "meta", metaFormId: f.id },
          { $set: { metaFormName: String(f.name).trim() } }
        )
      )
    );
  }

  const fetchedAt = new Date();
  const assignedTelecallerId = forceAssignToPrimaryTelecaller
    ? await getPrimaryTelecallerId(business)
    : null;

  const docs = [];
  let fetched = 0;
  let firstCursor = null;
  const formsSynced = [];
  const formErrors = [];

  for (const form of targetForms) {
    try {
      const data = await metaFetch(`${form.id}/leads`, useToken, {
        fields: "id,created_time,field_data,ad_id,adgroup_id,campaign_id",
        limit,
        after: targetForms.length === 1 ? after : undefined,
      });

      const rows = Array.isArray(data?.data) ? data.data : [];
      if (!firstCursor) {
        firstCursor = data?.paging?.cursors?.after || null;
      }
      fetched += rows.length;

      let validRows = 0;
      for (const lead of rows) {
        const fieldData = Array.isArray(lead.field_data) ? lead.field_data : [];
        const map = {};
        fieldData.forEach((f) => {
          if (!f?.name) return;
          const v = Array.isArray(f.values) ? f.values[0] : f.values;
          map[f.name] = v;
        });

        const fullName =
          map.full_name ||
          [map.first_name, map.last_name].filter(Boolean).join(" ").trim() ||
          map.name ||
          map.fullname;

        const phone =
          map.phone_number ||
          map.phone ||
          map.mobile_phone ||
          map.mobile ||
          map.contact_number;

        const email = map.email;

        if (!fullName || !phone) {
          continue;
        }

        const clientInterest = normalizeClientInterest(
          map.client_interest || map.interest || map.service || map.category
        );

        const parsedMetaLeadCreatedAt = lead?.created_time ? new Date(lead.created_time) : null;
        const metaLeadCreatedAt =
          parsedMetaLeadCreatedAt && !Number.isNaN(parsedMetaLeadCreatedAt.getTime())
            ? parsedMetaLeadCreatedAt
            : undefined;

        docs.push({
          name: String(fullName).trim(),
          phone: String(phone).trim(),
          email: email ? String(email).trim() : undefined,
          leadType: "meta",
          business,
          source: "meta",
          clientInterest,
          createdBy: actorUserId || undefined,
          assignedTo: assignedTelecallerId || undefined,
          metaLeadId: String(lead.id),
          metaFormId: form.id,
          metaFormName: form.name || undefined,
          metaLeadCreatedAt,
          metaCampaignId: lead.campaign_id || undefined,
          metaAdsetId: lead.adgroup_id || undefined,
          metaAdId: lead.ad_id || undefined,
          metaFetchedAt: fetchedAt,
          metaRaw: {
            created_time: lead.created_time,
            field_data: fieldData,
          },
        });
        validRows += 1;
      }

      formsSynced.push({
        id: form.id,
        name: form.name || "Unknown Form",
        fetched: rows.length,
        valid: validRows,
      });
    } catch (e) {
      formErrors.push({
        id: form.id,
        name: form.name || "Unknown Form",
        error: e.message,
      });
    }
  }

  let inserted = 0;
  if (docs.length) {
    const ops = docs.map((d) => {
      const insertDoc = { ...d };
      delete insertDoc.assignedTo;
      delete insertDoc.metaFetchedAt;
      delete insertDoc.metaFormName;
      delete insertDoc.metaLeadCreatedAt;

      const update = {
        $setOnInsert: insertDoc,
        $set: {
          metaFetchedAt: fetchedAt,
          metaLeadCreatedAt: d.metaLeadCreatedAt || null,
          ...(d.metaFormName ? { metaFormName: d.metaFormName } : {}),
        },
      };
      if (assignedTelecallerId) {
        update.$set.assignedTo = assignedTelecallerId;
      }

      return {
        updateOne: {
          filter: { metaLeadId: d.metaLeadId },
          update,
          upsert: true,
        },
      };
    });
    const result = await Lead.bulkWrite(ops, { ordered: false });
    inserted = result?.upsertedCount || 0;
  }

  const skipped = fetched - inserted;
  await MetaConfig.findOneAndUpdate(
    { business },
    {
      $set: {
        lastSyncAt: fetchedAt,
        lastSyncFetched: fetched,
        lastSyncInserted: inserted,
        lastSyncSkipped: skipped,
        lastSyncForms: formsSynced,
        lastSyncFormErrors: formErrors,
      },
    },
    { upsert: true }
  );

  return {
    fetched,
    inserted,
    skipped,
    nextCursor: targetForms.length === 1 ? firstCursor : null,
    fetchedAt,
    autoAssignedTo: assignedTelecallerId ? String(assignedTelecallerId) : null,
    formsSynced,
    formErrors,
  };
}

let metaAutoSyncTimer = null;
let metaAutoSyncInFlight = false;

const parsePositiveInt = (val, fallback) => {
  const n = Number.parseInt(String(val), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function startMetaAutoSyncJob() {
  if (metaAutoSyncTimer) return;

  const enabled =
    String(process.env.META_AUTO_SYNC_ENABLED || "true").toLowerCase() !== "false";
  if (!enabled) {
    console.log("[meta-auto-sync] disabled via META_AUTO_SYNC_ENABLED=false");
    return;
  }

  const intervalMinutes = parsePositiveInt(
    process.env.META_AUTO_SYNC_INTERVAL_MINUTES,
    30
  );
  const limit = parsePositiveInt(process.env.META_AUTO_SYNC_LIMIT, 100);

  const run = async () => {
    if (metaAutoSyncInFlight) return;
    metaAutoSyncInFlight = true;
    try {
      for (const business of BUSINESS_OPTIONS) {
        try {
          const cfg = await getMetaConfigDoc(business);
          if (!cfg?.accessTokenEnc || (!cfg?.pageId && !cfg?.formId)) {
            continue; // not configured for this business yet, skip silently
          }
          const result = await syncMetaLeads({
            business,
            limit,
            forceAssignToPrimaryTelecaller: true,
          });
          console.log(
            `[meta-auto-sync:${business}] ok fetched=${result.fetched} inserted=${result.inserted} assignedTo=${result.autoAssignedTo || "none"} at=${result.fetchedAt.toISOString()}`
          );
        } catch (e) {
          console.error(`[meta-auto-sync:${business}] failed: ${e.message}`);
        }
      }
    } finally {
      metaAutoSyncInFlight = false;
    }
  };

  metaAutoSyncTimer = setInterval(run, intervalMinutes * 60 * 1000);
  console.log(`[meta-auto-sync] started every ${intervalMinutes} minutes`);
  run();
}

/* ======================= DASHBOARD (simple) ======================= */
router.get("/dashboard", protect, requireRole(2), async (_req, res) => {
  const [totalClients, totalTelecallers, statusAgg] = await Promise.all([
    Lead.countDocuments(),
    User.countDocuments({ role: 1 }),
    Lead.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  const statusMap = Object.fromEntries(statusAgg.map((x) => [x._id, x.count]));
  res.json({
    totalClients,
    totalTelecallers,
    statusCounts: {
      initialize: statusMap.initialize || 0,
      followup: statusMap.followup || 0,
      success: statusMap.success || 0,
      failed: statusMap.failed || 0,
    },
  });
});

/* ================== ADMIN USERS ================== */
router.get("/admins", protect, requireRole(2), async (_req, res) => {
  const admins = await User.find({ role: 2 }).select("-password");
  res.json(admins);
});

router.post("/create-admin", protect, requireRole(2), async (req, res) => {
  try {
    const { name, mobile } = req.body;
    if (!mobile) return res.status(400).json({ message: "mobile required" });

    const exists = await User.findOne({ mobile });
    if (exists) return res.status(400).json({ message: "Mobile already registered" });

    const admin = await User.create({ name, mobile, role: 2 });
    res.json(admin);
  } catch (e) {
    res.status(500).json({ message: "Failed to create admin", error: e.message });
  }
});

/* ================= TELECALLERS ================= */
router.get("/telecallers", protect, requireRole(2), async (_req, res) => {
  const telecallers = await User.find({ role: 1 }).select("-password");
  res.json(telecallers);
});

router.get("/telecallers/:id", protect, requireRole(2), async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 1 }).select("-password");
  if (!user) return res.status(404).json({ message: "Telecaller not found" });
  res.json(user);
});

router.post("/add-telecaller", protect, requireRole(2), async (req, res) => {
  try {
    const { name, mobile } = req.body;
    if (!mobile) return res.status(400).json({ message: "mobile required" });

    const exists = await User.findOne({ mobile });
    if (exists) return res.status(400).json({ message: "Mobile already registered" });

    const telecaller = await User.create({ name, mobile, role: 1 });
    res.json(telecaller);
  } catch (e) {
    res.status(500).json({ message: "Failed to add telecaller", error: e.message });
  }
});

router.patch("/telecallers/:id/block", protect, requireRole(2), async (req, res) => {
  try {
    const { blocked, reason } = req.body;
    const now = blocked ? new Date() : null;

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: 1 },
      {
        $set: {
          blocked: !!blocked,
          blockedReason: blocked ? reason || null : null,
          blockedAt: now,
        },
      },
      { new: true, projection: { password: 0 } }
    );

    if (!user) return res.status(404).json({ message: "Telecaller not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: "Failed to update block status", error: e.message });
  }
});

/* ==================== LEAD DISTRIBUTION ==================== */
router.post("/distribute", protect, requireRole(2), async (req, res) => {
  try {
    const { method = "shuffle" } = req.body;

    // DoOnEarth leads never enter the general round-robin pool.
    const leads = await Lead.find({
      assignedTo: { $exists: false },
      business: { $ne: "doonearth" },
    }).sort({ createdAt: 1 });
    const telecallers = await User.find({ role: 1 }).sort({ createdAt: 1 });

    const distributed = distributeLeads(leads.map((l) => l.toObject()), telecallers, method);

    const ops = distributed.map((ld) => ({
      updateOne: { filter: { _id: ld._id }, update: { $set: { assignedTo: ld.assignedTo } } },
    }));
    if (ops.length) await Lead.bulkWrite(ops);

    // Safety net: any stray unassigned doonearth leads go straight to the restricted telecaller.
    const doonCfg = await getMetaConfigDoc("doonearth");
    if (doonCfg?.restrictedTelecallerId) {
      await Lead.updateMany(
        { business: "doonearth", assignedTo: { $exists: false } },
        { $set: { assignedTo: doonCfg.restrictedTelecallerId } }
      );
    }

    res.json({ message: "Leads distributed", method, count: ops.length });
  } catch (e) {
    res.status(500).json({ message: "Distribution failed", error: e.message });
  }
});

/* ================== META (LEAD ADS) INTEGRATION ================== */
// GET current config (masked)
router.get("/meta-config", protect, requireRole(2), async (req, res) => {
  try {
    const business = normalizeBusiness(req.query.business);
    if (!business) return res.status(400).json({ message: "valid business required" });
    const doc = await getMetaConfigDoc(business);
    res.json({
      business,
      pageId: doc?.pageId || null,
      formId: doc?.formId || null,
      tokenSet: !!doc?.accessTokenEnc,
      tokenHint: doc?.accessTokenHint || null,
      lastSyncAt: doc?.lastSyncAt || null,
      lastSyncFetched: doc?.lastSyncFetched ?? 0,
      lastSyncInserted: doc?.lastSyncInserted ?? 0,
      lastSyncSkipped: doc?.lastSyncSkipped ?? 0,
      lastSyncForms: doc?.lastSyncForms ?? [],
      lastSyncFormErrors: doc?.lastSyncFormErrors ?? [],
      updatedAt: doc?.updatedAt || null,
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to load Meta config", error: e.message });
  }
});

// PUT update config (token/page/form are all optional)
router.put("/meta-config", protect, requireRole(2), async (req, res) => {
  try {
    const { accessToken, pageId, formId } = req.body || {};
    const business = normalizeBusiness(req.body?.business);
    if (!business) return res.status(400).json({ message: "valid business required" });
    const doc = (await getMetaConfigDoc(business)) || new MetaConfig({ business });

    if (typeof accessToken !== "undefined") {
      const t = String(accessToken || "").trim();
      if (!t) {
        doc.accessTokenEnc = undefined;
        doc.accessTokenIv = undefined;
        doc.accessTokenTag = undefined;
        doc.accessTokenHint = undefined;
      } else {
        const enc = encryptText(t);
        doc.accessTokenEnc = enc.enc;
        doc.accessTokenIv = enc.iv;
        doc.accessTokenTag = enc.tag;
        doc.accessTokenHint = t.length >= 4 ? t.slice(-4) : t;
      }
    }

    if (typeof pageId !== "undefined") doc.pageId = String(pageId || "").trim() || null;
    if (typeof formId !== "undefined") doc.formId = String(formId || "").trim() || null;

    await doc.save();

    res.json({
      ok: true,
      business,
      pageId: doc.pageId || null,
      formId: doc.formId || null,
      tokenSet: !!doc.accessTokenEnc,
      tokenHint: doc.accessTokenHint || null,
      lastSyncAt: doc.lastSyncAt || null,
      lastSyncFetched: doc.lastSyncFetched ?? 0,
      lastSyncInserted: doc.lastSyncInserted ?? 0,
      lastSyncSkipped: doc.lastSyncSkipped ?? 0,
      lastSyncForms: doc.lastSyncForms ?? [],
      lastSyncFormErrors: doc.lastSyncFormErrors ?? [],
      updatedAt: doc.updatedAt || null,
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to save Meta config", error: e.message });
  }
});

// GET available Leadgen forms for a Page
router.get("/meta/forms", protect, requireRole(2), async (req, res) => {
  try {
    const business = normalizeBusiness(req.query.business);
    if (!business) return res.status(400).json({ message: "valid business required" });
    const doc = await getMetaConfigDoc(business);
    const token = decryptMetaToken(doc);
    const pageId = String(req.query.pageId || doc?.pageId || "").trim();
    if (!pageId) return res.status(400).json({ message: "pageId required" });

    const pageToken = await getPageAccessToken(pageId, token);
    const useToken = pageToken || token;
    const data = await metaFetch(`${pageId}/leadgen_forms`, useToken, {
      fields: "id,name,status,locale",
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch forms", error: e.message });
  }
});

// GET available Pages for this Meta token
router.get("/meta/pages", protect, requireRole(2), async (req, res) => {
  try {
    const business = normalizeBusiness(req.query.business);
    if (!business) return res.status(400).json({ message: "valid business required" });
    const doc = await getMetaConfigDoc(business);
    const token = decryptMetaToken(doc);
    const data = await metaFetch("me/accounts", token, { fields: "id,name" });
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch pages", error: e.message });
  }
});

// POST sync leads from a Leadgen Form
router.post("/meta/sync", protect, requireRole(2), async (req, res) => {
  try {
    const { formId, limit, after } = req.body || {};
    const business = normalizeBusiness(req.body?.business);
    if (!business) return res.status(400).json({ message: "valid business required" });
    const result = await syncMetaLeads({
      business,
      formId,
      limit,
      after,
      actorUserId: req.user?._id || null,
      forceAssignToPrimaryTelecaller: true,
    });
    res.json(result);
  } catch (e) {
    console.error("[meta/sync] error:", e.message, e.stack);
    const code = ["formId required", "Meta access token missing", "formId or pageId with forms required"].includes(e.message)
      ? 400
      : 500;
    res.status(code).json({ message: "Meta sync failed", error: e.message });
  }
});

/* =======================================================================
   NEW REPORTS (V2): summary + telecaller performance + per-telecaller leads
   Query params used commonly:
   - from, to (YYYY-MM-DD)
   - tz (default Asia/Kolkata)
   ======================================================================= */

/* ======================== SUMMARY (everything) ==========================
   GET /admin/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Asia/Kolkata&top=5&upcomingDays=7
   Returns one payload with:
   - status counts, bySource, byLeadType, daily trend, conversion
   - due {today, overdue, upcoming}
   - telecallersTop snapshot
=========================================================================== */
router.get("/reports/summary", protect, requireRole(2), async (req, res) => {
  const { from, to } = parseRange(req.query, 30);
  const tz = req.query.tz || TZ;
  const top = clampInt(req.query.top, 5, 1, 50);
  const upcomingDays = clampInt(req.query.upcomingDays, 7, 1, 60);

  try {
    const [{ start, end }] = [{ ...getDayRange(tz) }];
    const upcomingEnd = new Date(end.getTime() + upcomingDays * 86400000);

    const [byStatus, bySource, byLeadType, dailyNew, totalAssigned, totalUnassigned] = await Promise.all([
      Lead.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: { $ifNull: ["$source", "Unknown"] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Lead.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: { $ifNull: ["$leadType", "Unknown"] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Lead.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Lead.countDocuments({ assignedTo: { $ne: null } }),
      Lead.countDocuments({ $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }] }),
    ]);

    // Due buckets (global across assigned leads)
    const [dueToday, overdue, upcoming] = await Promise.all([
      Lead.countDocuments({ assignedTo: { $ne: null }, followUpDate: { $gte: start, $lte: end } }),
      Lead.countDocuments({ assignedTo: { $ne: null }, status: { $in: ACTIVE_STATUSES }, followUpDate: { $lt: start } }),
      Lead.countDocuments({ assignedTo: { $ne: null }, followUpDate: { $gt: end, $lte: upcomingEnd } }),
    ]);

    // Telecaller top snapshot (range-bound on createdAt)
    const teleTop = await Lead.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, assignedTo: { $ne: null } } },
      {
        $group: {
          _id: "$assignedTo",
          totalLeads: { $sum: 1 },
          initialize: { $sum: { $cond: [{ $eq: ["$status", "initialize"] }, 1, 0] } },
          followup: { $sum: { $cond: [{ $eq: ["$status", "followup"] }, 1, 0] } },
          success: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "telecaller",
        },
      },
      { $unwind: { path: "$telecaller", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          telecallerId: "$_id",
          name: "$telecaller.name",
          mobile: "$telecaller.mobile",
          totalLeads: 1,
          initialize: 1,
          followup: 1,
          success: 1,
          failed: 1,
        },
      },
      { $sort: { success: -1, totalLeads: -1 } },
      { $limit: top },
    ]);

    const statusMap = Object.fromEntries(byStatus.map((x) => [x._id, x.count]));
    const total = Object.values(statusMap).reduce((a, v) => a + v, 0);
    const conversionRate = total ? Math.round(((statusMap.success || 0) * 100) / total) : 0;

    res.json({
      range: { from, to, tz, upcomingDays },
      totals: {
        totalInRange: total,
        successRate: conversionRate,
        assigned: totalAssigned,
        unassigned: totalUnassigned,
        activeLeads: (statusMap.initialize || 0) + (statusMap.followup || 0),
      },
      status: {
        initialize: statusMap.initialize || 0,
        followup: statusMap.followup || 0,
        success: statusMap.success || 0,
        failed: statusMap.failed || 0,
      },
      bySource: bySource.map((x) => ({ source: x._id, count: x.count })),
      byLeadType: byLeadType.map((x) => ({ type: x._id, count: x.count })),
      daily: dailyNew.map((x) => ({ date: x._id, count: x.count })),
      due: { today: dueToday, overdue, upcoming },
      telecallersTop: teleTop.map((r) => ({
        id: r.telecallerId,
        name: r.name,
        mobile: r.mobile,
        totalLeads: r.totalLeads,
        initialize: r.initialize,
        followup: r.followup,
        success: r.success,
        failed: r.failed,
        conversion: r.totalLeads ? Math.round((r.success * 100) / r.totalLeads) : 0,
      })),
    });
  } catch (e) {
    res.status(500).json({ message: "Summary report error", error: e.message });
  }
});

/* ================== TELECALLER PERFORMANCE (list) ==================
   GET /admin/reports/telecallers?from&to&tz&sort=conversion|success|followups|dueToday|overdue|total
       &order=desc|asc&page=1&limit=50
==================================================================== */
router.get("/reports/telecallers", protect, requireRole(2), async (req, res) => {
  const { from, to } = parseRange(req.query, 7);
  const tz = req.query.tz || TZ;
  const sortField = (req.query.sort || "conversion").toString();
  const order = (req.query.order || "desc").toString().toLowerCase() === "asc" ? 1 : -1;
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 50, 1, 200);

  try {
    const baseMatch = { createdAt: { $gte: from, $lte: to } };

    const core = await Lead.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: "$assignedTo",
          totalLeads: { $sum: 1 },
          initialize: { $sum: { $cond: [{ $eq: ["$status", "initialize"] }, 1, 0] } },
          followup: { $sum: { $cond: [{ $eq: ["$status", "followup"] }, 1, 0] } },
          success: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
        },
      },
      {
        $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "telecaller" },
      },
      { $unwind: { path: "$telecaller", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          telecallerId: "$_id",
          name: "$telecaller.name",
          mobile: "$telecaller.mobile",
          blocked: "$telecaller.blocked",
          totalLeads: 1,
          initialize: 1,
          followup: 1,
          success: 1,
          failed: 1,
          _id: 0,
        },
      },
    ]);

    const { start, end } = getDayRange(tz);
    const upcomingEnd = new Date(end.getTime() + 7 * 86400000);

    const [dueToday, overdue, upcoming, activity] = await Promise.all([
      Lead.aggregate([
        { $match: { followUpDate: { $gte: start, $lte: end }, assignedTo: { $ne: null } } },
        { $group: { _id: "$assignedTo", dueToday: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        {
          $match: {
            assignedTo: { $ne: null },
            followUpDate: { $lt: start },
            status: { $in: ACTIVE_STATUSES },
          },
        },
        { $group: { _id: "$assignedTo", overdue: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        {
          $match: {
            assignedTo: { $ne: null },
            followUpDate: { $gt: end, $lte: upcomingEnd },
          },
        },
        { $group: { _id: "$assignedTo", upcoming: { $sum: 1 } } },
      ]),
      Followup.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        {
          $lookup: {
            from: "leads",
            localField: "lead",
            foreignField: "_id",
            as: "lead",
          },
        },
        { $unwind: "$lead" },
        { $group: { _id: "$lead.assignedTo", followups: { $sum: 1 } } },
      ]),
    ]);

    const map = (arr, key) => Object.fromEntries(arr.map((d) => [String(d._id), d[key]]));
    const dueMap = map(dueToday, "dueToday");
    const overMap = map(overdue, "overdue");
    const upcMap = map(upcoming, "upcoming");
    const actMap = map(activity, "followups");

    const enriched = core.map((r) => {
      const conversion = r.totalLeads ? Math.round((r.success * 100) / r.totalLeads) : 0;
      return {
        ...r,
        dueToday: dueMap[String(r.telecallerId)] || 0,
        overdue: overMap[String(r.telecallerId)] || 0,
        upcoming: upcMap[String(r.telecallerId)] || 0,
        followups: actMap[String(r.telecallerId)] || 0,
        conversion,
      };
    });

    const sortKey = (a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      return order * (av - bv);
    };
    enriched.sort(sortKey);

    const total = enriched.length;
    const startIdx = (page - 1) * limit;
    const items = enriched.slice(startIdx, startIdx + limit);

    res.json({
      range: { from, to, tz },
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      telecallers: items,
    });
  } catch (e) {
    res.status(500).json({ message: "Telecaller report error", error: e.message });
  }
});

/* ================== TELECALLER-FOCUSED LEADS ==================
   GET /admin/reports/telecaller/:id/leads?tz=&from=&to=&scope=assigned|created
       &status=initialize|followup|success|failed|all
       &due=overdue|today|upcoming|all&upcomingDays=7&q=&page=1&limit=20&sort=updatedAt|followUpDate
-----------------------------------------------------------------
   - scope=assigned (default): telecaller ke sab assigned leads (date filters sirf list sort/analytics me helpful)
   - scope=created: sirf woh leads jo is date range me create hue aur is telecaller ko assigned hain
   - returns: summary (byStatus + due buckets) + paginated items with last followup snapshot
================================================================= */
router.get("/reports/telecaller/:id/leads", protect, requireRole(2), async (req, res) => {
  const teleId = toObjectId(req.params.id);
  if (!teleId) return res.status(400).json({ message: "invalid telecaller id" });

  const tz = req.query.tz || TZ;
  const { from, to } = parseRange(req.query, 30);
  const scope = (req.query.scope || "assigned").toString(); // assigned | created
  const status = (req.query.status || "all").toString(); // specific or all
  const due = (req.query.due || "all").toString(); // overdue|today|upcoming|all
  const upcomingDays = clampInt(req.query.upcomingDays, 7, 1, 60);
  const q = (req.query.q || "").toString().trim();

  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 20, 1, 200);
  const sortField = ["updatedAt", "followUpDate", "createdAt"].includes(String(req.query.sort))
    ? String(req.query.sort)
    : "updatedAt";
  const sortDir = (req.query.order || "desc").toString().toLowerCase() === "asc" ? 1 : -1;

  try {
    // base match
    const m = { assignedTo: teleId };
    if (scope === "created") {
      m.createdAt = { $gte: from, $lte: to };
    }

    if (status !== "all") m.status = status;

    if (q) {
      m.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { source: { $regex: q, $options: "i" } },
        { leadType: { $regex: q, $options: "i" } },
      ];
    }

    // due filter windows
    const { start, end } = getDayRange(tz);
    const upcomingEnd = new Date(end.getTime() + upcomingDays * 86400000);
    if (due === "today") {
      m.followUpDate = { $gte: start, $lte: end };
    } else if (due === "overdue") {
      m.followUpDate = { $lt: start };
      m.status = m.status || { $in: ACTIVE_STATUSES };
    } else if (due === "upcoming") {
      m.followUpDate = { $gt: end, $lte: upcomingEnd };
    }

    // SUMMARY for this telecaller (unfiltered by q, but respecting scope/status/due)
    const summaryMatch = { ...m };
    delete summaryMatch.$or; // q not in summary counts

    const [byStatus, dueBuckets] = await Promise.all([
      Lead.aggregate([
        { $match: summaryMatch },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      (async () => {
        const base = { assignedTo: teleId };
        if (scope === "created") base.createdAt = { $gte: from, $lte: to };
        if (status !== "all") base.status = status;

        const [over, today, upc] = await Promise.all([
          Lead.countDocuments({ ...base, status: { $in: ACTIVE_STATUSES }, followUpDate: { $lt: start } }),
          Lead.countDocuments({ ...base, followUpDate: { $gte: start, $lte: end } }),
          Lead.countDocuments({ ...base, followUpDate: { $gt: end, $lte: upcomingEnd } }),
        ]);
        return { overdue: over, today, upcoming: upc };
      })(),
    ]);

    const statusMap = Object.fromEntries(byStatus.map((x) => [x._id, x.count]));
    const total = Object.values(statusMap).reduce((a, v) => a + v, 0);

    // ITEMS list with last followup snapshot
    const pipeline = [
      { $match: m },
      {
        $lookup: {
          from: "followups",
          let: { leadId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$lead", "$$leadId"] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "lastFollowup",
        },
      },
      { $unwind: { path: "$lastFollowup", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: 1,
          phone: 1,
          email: 1,
          status: 1,
          source: 1,
          leadType: 1,
          followUpDate: 1,
          createdAt: 1,
          updatedAt: 1,
          lastNote: "$lastFollowup.note",
          lastStatus: "$lastFollowup.status",
          lastOutcome: "$lastFollowup.outcome", // if your Followup has this field
          lastFollowupAt: "$lastFollowup.createdAt",
        },
      },
      { $sort: { [sortField]: sortDir, createdAt: -1 } },
      {
        $facet: {
          items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          meta: [{ $count: "total" }],
        },
      },
    ];

    const result = await Lead.aggregate(pipeline);
    const items = result[0]?.items || [];
    const totalItems = result[0]?.meta?.[0]?.total || 0;

    const tele = await User.findOne({ _id: teleId, role: 1 }).select("name mobile blocked");
    if (!tele) return res.status(404).json({ message: "Telecaller not found" });

    res.json({
      range: { from, to, tz, scope, upcomingDays },
      telecaller: { id: tele._id, name: tele.name, mobile: tele.mobile, blocked: tele.blocked || false },
      summary: {
        total,
        byStatus: {
          initialize: statusMap.initialize || 0,
          followup: statusMap.followup || 0,
          success: statusMap.success || 0,
          failed: statusMap.failed || 0,
        },
        due: dueBuckets,
      },
      page,
      limit,
      totalItems,
      pages: Math.ceil(totalItems / limit),
      items,
    });
  } catch (e) {
    res.status(500).json({ message: "Telecaller leads error", error: e.message });
  }
});

/* ======================== REPORTS: OVERVIEW (legacy) =======================
   GET /admin/reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
============================================================================ */
router.get("/reports/overview", protect, requireRole(2), async (req, res) => {
  const { from, to } = parseRange(req.query, 30);

  try {
    const [byStatus, bySource, dailyNew] = await Promise.all([
      Lead.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: { $ifNull: ["$source", "Unknown"] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Lead.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const statusMap = Object.fromEntries(byStatus.map((x) => [x._id, x.count]));
    const total = Object.values(statusMap).reduce((a, v) => a + v, 0);
    const conversionRate = total ? Math.round(((statusMap.success || 0) * 100) / total) : 0;

    res.json({
      from,
      to,
      byStatus: statusMap,
      bySource: bySource.map((x) => ({ source: x._id, count: x.count })),
      daily: dailyNew.map((x) => ({ date: x._id, count: x.count })),
      totals: { total, conversionRate },
    });
  } catch (e) {
    res.status(500).json({ message: "Overview report error", error: e.message });
  }
});

/* ========== LEGACY SUMMARY (compat) ==========
   GET /admin/reports/leads?from&to
================================================ */
router.get("/reports/leads", protect, requireRole(2), async (req, res) => {
  const { from, to } = parseRange(req.query, 30);

  try {
    const [statusAgg, typeAgg] = await Promise.all([
      Lead.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: { $ifNull: ["$leadType", "Unknown"] }, count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      from,
      to,
      byStatus: Object.fromEntries(statusAgg.map((x) => [x._id, x.count])),
      byType: Object.fromEntries(typeAgg.map((x) => [x._id, x.count])),
    });
  } catch (e) {
    res.status(500).json({ message: "Report error", error: e.message });
  }
});

/* ================== LEADS TABLE (legacy paginated) ==================
   GET /admin/reports/leads-table?from&to&status&assignedTo&q&page&limit
===================================================================== */
router.get("/reports/leads-table", protect, requireRole(2), async (req, res) => {
  const { from, to } = parseRange(req.query, 30);
  const { status, assignedTo, q } = req.query;
  const pageRaw = req.query.page ?? 1;
  const limitRaw = req.query.limit ?? 20;

  const pg = Math.max(1, parseInt(String(pageRaw), 10));
  const lim = Math.min(200, Math.max(1, parseInt(String(limitRaw), 10)));

  const m = { createdAt: { $gte: from, $lte: to } };
  if (status) m.status = status;
  if (assignedTo) {
    try {
      m.assignedTo = new Types.ObjectId(String(assignedTo));
    } catch {
      return res.status(400).json({ message: "invalid assignedTo" });
    }
  }
  if (q) {
    const t = String(q).trim();
    m.$or = [
      { name: { $regex: t, $options: "i" } },
      { email: { $regex: t, $options: "i" } },
      { phone: { $regex: t, $options: "i" } },
      { source: { $regex: t, $options: "i" } },
    ];
  }

  try {
    const pipeline = [
      { $match: m },
      {
        $lookup: {
          from: "users",
          localField: "assignedTo",
          foreignField: "_id",
          as: "assignedUser",
        },
      },
      { $unwind: { path: "$assignedUser", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "followups",
          let: { leadId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$lead", "$$leadId"] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "lastFollowup",
        },
      },
      { $unwind: { path: "$lastFollowup", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: 1,
          phone: 1,
          email: 1,
          status: 1,
          source: 1,
          leadType: 1,
          followUpDate: 1,
          createdAt: 1,
          updatedAt: 1,
          assignedTo: "$assignedUser._id",
          assignedName: "$assignedUser.name",
          assignedMobile: "$assignedUser.mobile",
          lastNote: "$lastFollowup.note",
          lastOutcome: "$lastFollowup.outcome",
          lastFollowupAt: "$lastFollowup.createdAt",
        },
      },
      { $sort: { updatedAt: -1, createdAt: -1 } },
      {
        $facet: {
          items: [{ $skip: (pg - 1) * lim }, { $limit: lim }],
          meta: [{ $count: "total" }],
        },
      },
    ];

    const result = await Lead.aggregate(pipeline);
    const items = (result[0]?.items || []).map((x) => ({
      ...x,
      assignedTo: x.assignedTo || null,
    }));
    const total = result[0]?.meta?.[0]?.total || 0;
    res.json({
      page: pg,
      limit: lim,
      total,
      pages: Math.ceil(total / lim),
      items,
    });
  } catch (e) {
    res.status(500).json({ message: "Leads table error", error: e.message });
  }
});

/* ============= SINGLE LEAD WITH FULL HISTORY (legacy) =============
   GET /admin/reports/lead/:id
=================================================================== */
router.get("/reports/lead/:id", protect, requireRole(2), async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ message: "invalid id" });

  try {
    const lead = await Lead.findById(id)
      .populate({ path: "assignedTo", select: "name mobile role blocked" })
      .lean();

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const history = await Followup.find({ lead: id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ lead, history });
  } catch (e) {
    res.status(500).json({ message: "Lead history error", error: e.message });
  }
});

export default router;
