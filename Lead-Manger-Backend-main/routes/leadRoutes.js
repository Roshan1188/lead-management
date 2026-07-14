// backend/routes/lead.routes.js
import express from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import Lead, { CLIENT_INTEREST_OPTIONS, BUSINESS_OPTIONS } from "../models/Lead.js";
import Followup from "../models/Followup.js";
import MetaConfig from "../models/MetaConfig.js";
import StatusReason from "../models/StatusReason.js";
import CustomStatus from "../models/CustomStatus.js";
import { protect /*, requireRole*/ } from "../middleware/authMiddleware.js";
import { uploadBuffer } from "../utils/uploadBuffer.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

/* Read-only status reason options (used by admin + telecaller UIs) */
router.get("/status-reasons", protect, async (_req, res) => {
  try {
    const items = await StatusReason.find().sort({ baseStatus: 1, order: 1, createdAt: 1 }).lean();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch status reasons", error: e.message });
  }
});

/* Read-only custom top-level statuses (used by admin + telecaller UIs) */
router.get("/custom-statuses", protect, async (_req, res) => {
  try {
    const items = await CustomStatus.find().sort({ order: 1, createdAt: 1 }).lean();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch custom statuses", error: e.message });
  }
});

/* ------------------- helpers ------------------- */
const ensureAssignedForTelecaller = (payload, user) => {
  // Agar telecaller hai (role === 1) aur assignedTo nahi diya gaya
  if (user?.role === 1 && !payload.assignedTo) {
    return { ...payload, assignedTo: user._id };
  }
  return payload;
};

const normalizeBusiness = (val) => {
  const v = String(val || "").trim();
  return BUSINESS_OPTIONS.includes(v) ? v : null;
};

// Manual telecaller entry points must never be able to mint a DoOnEarth lead
// outside the real Meta sync; admins must explicitly pick a business.
const resolveBusinessForWrite = (requestedBusiness, user) => {
  if (user?.role === 1) return "spacemanager";
  return normalizeBusiness(requestedBusiness);
};

async function getRestrictedTelecallerId(business) {
  if (business !== "doonearth") return null;
  const doc = await MetaConfig.findOne({ business: "doonearth" }).select("restrictedTelecallerId").lean();
  return doc?.restrictedTelecallerId || null;
}

// optional: CSV / JSON se aayi interest ko clean karne ka helper
const normalizeClientInterest = (val) => {
  if (!val) return undefined;
  const v = String(val).trim();
  // direct match try:
  if (CLIENT_INTEREST_OPTIONS.includes(v)) return v;

  // thoda loose matching (lowercase)
  const lower = v.toLowerCase();
  const found = CLIENT_INTEREST_OPTIONS.find(
    (opt) => opt.toLowerCase() === lower
  );
  return found || undefined;
};

/* ------------------- create single lead ------------------- */
// Create single Lead (leadType = create)
router.post("/create", protect, async (req, res) => {
  try {
    const business = resolveBusinessForWrite(req.body.business, req.user);
    if (!business) return res.status(400).json({ message: "valid business required" });

    let payload = {
      ...req.body,
      leadType: "create",
      business,
      createdBy: req.user._id,
    };

    // interest normalize (optional but safe)
    if (payload.clientInterest) {
      payload.clientInterest = normalizeClientInterest(payload.clientInterest);
    }

    // ✅ Telecaller ke liye khud pe assign
    payload = ensureAssignedForTelecaller(payload, req.user);

    const lead = await Lead.create(payload);
    res.json(lead);
  } catch (e) {
    res.status(500).json({ message: "Create failed", error: e.message });
  }
});

/* ------------------- bulk JSON ------------------- */
// Bulk Upload via JSON
router.post("/bulk-json", protect, async (req, res) => {
  try {
    const { leads = [] } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: "leads array required" });
    }

    const business = resolveBusinessForWrite(req.body.business, req.user);
    if (!business) return res.status(400).json({ message: "valid business required" });

    const docs = leads.map((l) => {
      let base = {
        ...l,
        leadType: "bulk",
        business,
        createdBy: req.user._id,
      };

      if (base.clientInterest) {
        base.clientInterest = normalizeClientInterest(base.clientInterest);
      }

      // ✅ Telecaller -> assignedTo = telecaller
      base = ensureAssignedForTelecaller(base, req.user);
      return base;
    });

    const result = await Lead.insertMany(docs, { ordered: false });
    res.json({ inserted: result.length });
  } catch (e) {
    res.status(500).json({ message: "Bulk JSON failed", error: e.message });
  }
});

/* ------------------- bulk CSV ------------------- */
// Bulk Upload via CSV (multipart file)
router.post("/bulk-csv", protect, upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ message: "CSV file (field 'file') required" });

    const business = resolveBusinessForWrite(req.body.business, req.user);
    if (!business) return res.status(400).json({ message: "valid business required" });

    const csvText = req.file.buffer.toString("utf8");
    const rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const docs = rows
      .map((r) => {
        let base = {
          name: r.name?.trim(),
          phone: String(r.phone || "").trim(),
          email: r.email?.trim(),
          // CSV column: clientInterest (exact same naam)
          clientInterest: normalizeClientInterest(
            r.clientInterest || r.client_interest || r.interest
          ),
          leadType: "bulk",
          business,
          createdBy: req.user._id,
        };
        // ✅ Telecaller -> assignedTo = telecaller
        base = ensureAssignedForTelecaller(base, req.user);
        return base;
      })
      .filter((x) => x.name && x.phone);

    const result = await Lead.insertMany(docs, { ordered: false });
    res.json({ inserted: result.length });
  } catch (e) {
    res.status(500).json({ message: "Bulk CSV failed", error: e.message });
  }
});

/* ------------------- meta lead ------------------- */
// Meta Lead
router.post("/meta", protect, async (req, res) => {
  try {
    let payload = {
      ...req.body,
      leadType: "meta",
      // Manual "social media" entries always belong to Space Manager; the real
      // Meta API sync (adminRoutes.js syncMetaLeads) is the only path that can
      // create a DoOnEarth lead.
      business: "spacemanager",
      createdBy: req.user._id,
      metaFetchedAt: req.body?.metaFetchedAt || new Date(),
    };

    if (payload.clientInterest) {
      payload.clientInterest = normalizeClientInterest(payload.clientInterest);
    }

    // ✅ Telecaller -> assignedTo = telecaller
    payload = ensureAssignedForTelecaller(payload, req.user);

    const lead = await Lead.create(payload);
    res.json(lead);
  } catch (e) {
    res
      .status(500)
      .json({ message: "Meta lead create failed", error: e.message });
  }
});

/* ------------------- list leads ------------------- */
// List leads (admin sees all; telecaller sees own)
router.get("/", protect, async (req, res) => {
  const {
    status,
    leadType,
    assignedTo,
    q,
    clientInterest,
    business,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (leadType) filter.leadType = leadType;
  if (clientInterest) {
    filter.clientInterest = clientInterest;
  }
  if (business && normalizeBusiness(business)) {
    filter.business = normalizeBusiness(business);
  }

  // Date range filter on createdAt
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  // Admin / higher: query se filter.allowed
  if (assignedTo && req.user.role !== 1) {
    filter.assignedTo = assignedTo;
  }

  // ✅ Telecaller: sirf apne leads (assignedTo ya createdBy)
  if (req.user.role === 1) {
    filter.$or = [{ assignedTo: req.user._id }, { createdBy: req.user._id }];
  }

  if (q) {
    // agar already $or hai (telecaller case) to uske andar push nahi kar rahe,
    // simple approach: ek alag $and laga dete hain
    const search = {
      $or: [
        { name: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ],
    };

    if (filter.$and) {
      filter.$and.push(search);
    } else {
      const base = { ...filter };
      delete base.$and;
      Object.keys(base).length
        ? (filter.$and = [base, search])
        : Object.assign(filter, search);
    }
  }

  const skip = (Number(page) - 1) * Number(limit);
  try {
    const [items, total] = await Promise.all([
      Lead.find(filter)
        .sort({ metaLeadCreatedAt: -1, metaFetchedAt: -1, updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("assignedTo", "name mobile")
        .populate("createdBy", "name mobile"),
      Lead.countDocuments(filter),
    ]);
    res.json({
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
      items,
    });
  } catch (e) {
    res.status(500).json({ message: "List failed", error: e.message });
  }
});

/* ------------------- lead detail + history ------------------- */
// Lead details with followup history
router.get("/:id", protect, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate("assignedTo", "name mobile")
      .populate("createdBy", "name mobile");
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    if (
      req.user.role === 1 &&
      String(lead.assignedTo) !== String(req.user._id) &&
      String(lead.createdBy) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const history = await Followup.find({ lead: lead._id })
      .populate("telecaller", "name mobile")
      .sort({ createdAt: -1 });

    res.json({ lead, history });
  } catch (e) {
    res.status(500).json({ message: "Fetch failed", error: e.message });
  }
});

/* ------------------- update lead ------------------- */
// Update lead (admin or assigned telecaller)
router.put("/:id", protect, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    if (
      req.user.role === 1 &&
      String(lead.assignedTo) !== String(req.user._id) &&
      String(lead.createdBy) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // DoOnEarth leads may only ever be assigned to the one restricted telecaller.
    if (
      lead.business === "doonearth" &&
      typeof req.body.assignedTo !== "undefined"
    ) {
      const restrictedId = await getRestrictedTelecallerId("doonearth");
      if (!restrictedId || String(req.body.assignedTo) !== String(restrictedId)) {
        return res.status(403).json({
          message: "DoOnEarth leads can only be assigned to the designated telecaller",
        });
      }
    }

    const updatable = [
      "name",
      "phone",
      "email",
      "status",
      "reason",
      "followUpDate",
      "journeyStage",
      "assignedTo",
      "leadType",
      "source",
      "clientInterest", // 👈 new field updatable
    ];

    for (const k of updatable) {
      if (typeof req.body[k] !== "undefined") {
        if (k === "clientInterest") {
          lead[k] = normalizeClientInterest(req.body[k]);
        } else {
          lead[k] = req.body[k];
        }
      }
    }
    await lead.save();
    res.json(lead);
  } catch (e) {
    res.status(500).json({ message: "Update failed", error: e.message });
  }
});

/* ------------------- upload attachments ------------------- */
// Upload attachments to a lead (Cloudinary)
router.post(
  "/:id/upload",
  protect,
  upload.array("files", 5),
  async (req, res) => {
    try {
      const lead = await Lead.findById(req.params.id);
      if (!lead) return res.status(404).json({ message: "Lead not found" });

      if (
        req.user.role === 1 &&
        String(lead.assignedTo) !== String(req.user._id) &&
        String(lead.createdBy) !== String(req.user._id)
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          message: "No files uploaded. Use field name 'files'.",
        });
      }

      const uploads = [];
      for (const f of req.files) {
        const uploaded = await uploadBuffer(f.buffer, "lead_attachments");
        uploads.push(uploaded);
      }
      lead.attachments = [...(lead.attachments || []), ...uploads];
      await lead.save();

      res.json({ message: "Uploaded", attachments: lead.attachments });
    } catch (e) {
      res.status(500).json({ message: "Upload failed", error: e.message });
    }
  }
);

export default router;
