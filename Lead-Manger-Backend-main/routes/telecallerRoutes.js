// src/routes/telecaller.js
import express from "express";
import mongoose from "mongoose";
import Lead from "../models/Lead.js";
import Followup from "../models/Followup.js";
import FollowupAudit from "../models/FollowupAudit.js";
import CustomStatus from "../models/CustomStatus.js";
import { protect, requireRole } from "../middleware/authMiddleware.js";
import { getDayRange, parseDate } from "../utils/date.js";

const router = express.Router();

/* ============================= Helpers ============================= */
const clampInt = (v, def, min, max) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
};

const safeDate = (v) => (v ? new Date(v) : null);

const getClientMeta = (req) => ({
  ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
  ua: req.headers["user-agent"] || null,
  source: "telecaller",
});

/* ====================== Dashboard Stats (telecaller) ====================== */
router.get("/dashboard", protect, requireRole(1), async (req, res) => {
  try {
    const [agg, customStatusList] = await Promise.all([
      Lead.aggregate([
        { $match: { assignedTo: new mongoose.Types.ObjectId(req.user._id) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      CustomStatus.find().sort({ order: 1, createdAt: 1 }).lean(),
    ]);

    const map = Object.fromEntries(agg.map((x) => [x._id, x.count]));
    const customStatusCounts = customStatusList.map((s) => ({
      slug: s.slug,
      label: s.label,
      count: map[s.slug] || 0,
    }));
    res.json({
      total: agg.reduce((sum, x) => sum + x.count, 0),
      initialize: map.initialize || 0,
      followup: map.followup || 0,
      success: map.success || 0,
      failed: map.failed || 0,
      customStatusCounts,
    });
  } catch (e) {
    res.status(500).json({ message: "Dashboard error", error: e.message });
  }
});

/* ====================== List my leads with filters ====================== */
router.get("/leads", protect, requireRole(1), async (req, res) => {
  try {
    const { status, q, metaFormId, dateFrom, dateTo, followUpFrom, followUpTo } = req.query;
    const page = clampInt(req.query.page, 1, 1, 10_000);
    const limit = clampInt(req.query.limit, 20, 1, 100);

    const filter = { assignedTo: req.user._id };
    if (status) filter.status = status;
    if (metaFormId && String(metaFormId).trim() && String(metaFormId) !== "all") {
      filter.metaFormId = String(metaFormId).trim();
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    if (followUpFrom || followUpTo) {
      filter.followUpDate = {};
      if (followUpFrom) filter.followUpDate.$gte = new Date(followUpFrom);
      if (followUpTo) {
        const end = new Date(followUpTo);
        end.setHours(23, 59, 59, 999);
        filter.followUpDate.$lte = end;
      }
    }
    if (q && String(q).trim()) {
      const term = String(q).trim();
      filter.$or = [
        { name: { $regex: term, $options: "i" } },
        { phone: { $regex: term, $options: "i" } },
        { email: { $regex: term, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const telecallerObjectId = new mongoose.Types.ObjectId(req.user._id);

    const [items, total, forms] = await Promise.all([
      // Latest-first view with Meta fetch priority so fresh Meta leads don't get missed.
      Lead.find(filter)
        .sort({ metaLeadCreatedAt: -1, metaFetchedAt: -1, updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(filter),
      Lead.aggregate([
        {
          $match: {
            assignedTo: telecallerObjectId,
            leadType: "meta",
            metaFormId: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: "$metaFormId",
            name: { $max: "$metaFormName" },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            id: "$_id",
            name: { $ifNull: ["$name", "Unknown Form"] },
            count: 1,
          },
        },
        { $sort: { count: -1, name: 1 } },
      ]),
    ]);

    res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items,
      forms,
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch leads", error: e.message });
  }
});

/* =========== Update lead status / followup (only my assigned leads) =========== */
/**
 * Body:
 *  - status?: "initialize" | "followup" | "success" | "failed"
 *  - reason?: string
 *  - followUpDate?: string(ISO) | null
 *  - note?: string            // OPTIONAL: free text
 *
 * Creates:
 *  - Followup (activity)
 *  - FollowupAudit (diff of old/new)
 */
const BUILT_IN_STATUSES = ["initialize", "followup", "success", "failed"];

router.post("/update-status/:id", protect, requireRole(1), async (req, res) => {
  try {
    const { status, reason, followUpDate, note, journeyStage } = req.body;

    const JOURNEY_STAGES = ["call", "visit", "quotation", "decision"];
    if (journeyStage && !JOURNEY_STAGES.includes(journeyStage)) {
      return res.status(400).json({ message: `Invalid journeyStage: ${journeyStage}` });
    }

    if (status) {
      const allowed = new Set(BUILT_IN_STATUSES);
      (await CustomStatus.find().select("slug").lean()).forEach((c) => allowed.add(c.slug));
      if (!allowed.has(status)) {
        return res.status(400).json({ message: `Invalid status: ${status}` });
      }
    }

    const lead = await Lead.findOne({
      _id: req.params.id,
      assignedTo: req.user._id,
    });
    if (!lead)
      return res.status(404).json({ message: "Lead not found or not assigned to you" });

    // Capture previous state (for audit)
    const prevStatus = lead.status || null;
    const prevReason = typeof lead.reason === "string" ? lead.reason : null;
    const prevFollowUpDate = lead.followUpDate || null;

    // Apply changes
    let changed = false;

    if (status && status !== prevStatus) {
      lead.status = status;
      changed = true;
    }
    if (journeyStage && journeyStage !== lead.journeyStage) {
      lead.journeyStage = journeyStage;
      changed = true;
    }
    if (typeof reason !== "undefined" && reason !== prevReason) {
      lead.reason = reason;
      changed = true;
    }
    if (typeof followUpDate !== "undefined") {
      const next = followUpDate ? safeDate(followUpDate) : null;
      const prevTs = prevFollowUpDate ? prevFollowUpDate.getTime() : null;
      const nextTs = next ? next.getTime() : null;
      if (prevTs !== nextTs) {
        lead.followUpDate = next;
        changed = true;
      }
    }

    // Always allow note-only activity (even if no field changed)
    const nextStatus = lead.status || null;
    const nextReason = typeof lead.reason === "string" ? lead.reason : null;
    const nextFollowUpDate = lead.followUpDate || null;

    await lead.save();

    // 1) Create FOLLOWUP activity row (for visible timeline)
    await Followup.create({
      lead: lead._id,
      telecaller: req.user._id,
      status: lead.status,
      note: note || reason || null, // keep some text visible in activity
      reason: nextReason ?? null,
      nextFollowDate: nextFollowUpDate || null,
    });

    // 2) Create AUDIT with diffs (for exact tracking)
    const meta = getClientMeta(req);
    const somethingChanged =
      prevStatus !== nextStatus ||
      prevReason !== nextReason ||
      String(prevFollowUpDate || "") !== String(nextFollowUpDate || "");

    const action = note && !somethingChanged ? "note" : ( // only note
      prevFollowUpDate !== nextFollowUpDate && prevStatus === nextStatus && prevReason === nextReason
        ? "schedule_change"
        : (prevStatus !== nextStatus || prevReason !== nextReason
            ? "status_change"
            : "update") // e.g., reason-only change, or mixed
    );

    await FollowupAudit.create({
      lead: lead._id,
      telecaller: req.user._id,
      action,
      prevStatus,
      newStatus: nextStatus,
      prevReason,
      newReason: nextReason,
      prevFollowUpDate,
      newFollowUpDate: nextFollowUpDate,
      note: note || null,
      meta,
    });

    res.json({ message: "Lead updated", lead });
  } catch (e) {
    res.status(500).json({ message: "Update failed", error: e.message });
  }
});

/* =========== Note-only endpoint (no field change required) =========== */
/**
 * POST /telecaller/lead/:id/note
 * Body: { note: string }
 * Creates Followup + FollowupAudit(action="note")
 */
router.post("/lead/:id/note", protect, requireRole(1), async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ message: "note is required" });
    }

    const lead = await Lead.findOne({
      _id: req.params.id,
      assignedTo: req.user._id,
    });
    if (!lead)
      return res.status(404).json({ message: "Lead not found or not assigned to you" });

    // Create a basic activity
    await Followup.create({
      lead: lead._id,
      telecaller: req.user._id,
      status: lead.status,
      note,
      reason: lead.reason ?? null,
      nextFollowDate: lead.followUpDate || null,
    });

    // Audit
    const meta = getClientMeta(req);
    await FollowupAudit.create({
      lead: lead._id,
      telecaller: req.user._id,
      action: "note",
      prevStatus: lead.status,
      newStatus: lead.status,
      prevReason: lead.reason ?? null,
      newReason: lead.reason ?? null,
      prevFollowUpDate: lead.followUpDate || null,
      newFollowUpDate: lead.followUpDate || null,
      note,
      meta,
    });

    res.json({ message: "Note added" });
  } catch (e) {
    res.status(500).json({ message: "Note failed", error: e.message });
  }
});

/* =================== Today's reminders (by timezone, default IST) =================== */
router.get("/reminders", protect, requireRole(1), async (req, res) => {
  try {
    const tz =
      (req.query.tz && String(req.query.tz)) ||
      process.env.APP_TIMEZONE ||
      "Asia/Kolkata";
    const { start, end } = getDayRange(tz);

    const leads = await Lead.find({
      assignedTo: req.user._id,
      followUpDate: { $gte: start, $lte: end },
    })
      .sort({ followUpDate: 1 })
      .lean();

    res.json({ tz, start, end, count: leads.length, items: leads });
  } catch (e) {
    res.status(500).json({ message: "Reminders error", error: e.message });
  }
});

/* ============ Calendar view: per-day followup & new-lead counts ============ */
router.get("/leads/calendar", protect, requireRole(1), async (req, res) => {
  try {
    const tz =
      (req.query.tz && String(req.query.tz)) ||
      process.env.APP_TIMEZONE ||
      "Asia/Kolkata";
    const from = parseDate(req.query.from) || new Date(Date.now() - 30 * 86400000);
    const to = parseDate(req.query.to) || new Date();
    to.setHours(23, 59, 59, 999);

    const telecallerObjectId = new mongoose.Types.ObjectId(req.user._id);

    const [followupAgg, createdAgg] = await Promise.all([
      Lead.aggregate([
        {
          $match: {
            assignedTo: telecallerObjectId,
            followUpDate: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$followUpDate", timezone: tz } },
            count: { $sum: 1 },
          },
        },
      ]),
      Lead.aggregate([
        {
          $match: {
            assignedTo: telecallerObjectId,
            createdAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const followupMap = Object.fromEntries(followupAgg.map((x) => [x._id, x.count]));
    const createdMap = Object.fromEntries(createdAgg.map((x) => [x._id, x.count]));
    const dates = new Set([...Object.keys(followupMap), ...Object.keys(createdMap)]);

    res.json({
      tz,
      from,
      to,
      days: Array.from(dates)
        .sort()
        .map((date) => ({
          date,
          followupCount: followupMap[date] || 0,
          createdCount: createdMap[date] || 0,
        })),
    });
  } catch (e) {
    res.status(500).json({ message: "Calendar aggregation failed", error: e.message });
  }
});

/* =================== Telecaller simple report (by date range) =================== */
router.get("/report", protect, requireRole(1), async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from) || new Date(Date.now() - 7 * 86400000);
    const toDate = parseDate(to) || new Date();

    const [agg, customStatusList] = await Promise.all([
      Lead.aggregate([
        {
          $match: {
            assignedTo: new mongoose.Types.ObjectId(req.user._id),
            createdAt: { $gte: fromDate, $lte: toDate },
          },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      CustomStatus.find().sort({ order: 1, createdAt: 1 }).lean(),
    ]);

    const map = Object.fromEntries(agg.map((x) => [x._id, x.count]));
    res.json({
      from: fromDate,
      to: toDate,
      initialize: map.initialize || 0,
      followup: map.followup || 0,
      success: map.success || 0,
      failed: map.failed || 0,
      customStatusCounts: customStatusList.map((s) => ({
        slug: s.slug,
        label: s.label,
        count: map[s.slug] || 0,
      })),
    });
  } catch (e) {
    res.status(500).json({ message: "Report error", error: e.message });
  }
});

/* =================== Lead full history (timeline) =================== */
/**
 * GET /telecaller/lead/:id/history
 * Returns lead + merged timeline:
 * [
 *   { type: "followup", at, status, note, reason, nextFollowDate, by: { name, _id } }
 *   { type: "audit",    at, action, diff: {status, reason, followUpDate}, note, by: {...} }
 * ]
 */
router.get("/lead/:id/history", protect, requireRole(1), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "invalid id" });

    const lead = await Lead.findOne({
      _id: id,
      assignedTo: req.user._id,
    })
      .populate({ path: "assignedTo", select: "name mobile" })
      .lean();

    if (!lead)
      return res
        .status(404)
        .json({ message: "Lead not found or not assigned to you" });

    // Parallel fetch
    const [followups, audits] = await Promise.all([
      Followup.find({ lead: id })
        .populate({ path: "telecaller", select: "name mobile" })
        .sort({ createdAt: -1 })
        .lean(),
      FollowupAudit.find({ lead: id })
        .populate({ path: "telecaller", select: "name mobile" })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    // Normalize & merge
    const t1 = followups.map((f) => ({
      type: "followup",
      at: f.createdAt,
      by: f.telecaller ? { _id: f.telecaller._id, name: f.telecaller.name, mobile: f.telecaller.mobile } : null,
      status: f.status || null,
      note: f.note || null,
      reason: f.reason ?? null,
      nextFollowDate: f.nextFollowDate || null,
    }));

    const t2 = audits.map((a) => ({
      type: "audit",
      at: a.createdAt,
      by: a.telecaller ? { _id: a.telecaller._id, name: a.telecaller.name, mobile: a.telecaller.mobile } : null,
      action: a.action,
      note: a.note || null,
      diff: {
        status: { from: a.prevStatus ?? null, to: a.newStatus ?? null },
        reason: { from: a.prevReason ?? null, to: a.newReason ?? null },
        followUpDate: {
          from: a.prevFollowUpDate || null,
          to: a.newFollowUpDate || null,
        },
      },
      meta: a.meta || null,
    }));

    const timeline = [...t1, ...t2].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );

    res.json({ lead, timeline });
  } catch (e) {
    res.status(500).json({ message: "History error", error: e.message });
  }
});

export default router;
