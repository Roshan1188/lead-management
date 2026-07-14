import mongoose from "mongoose";

export const CLIENT_INTEREST_OPTIONS = [
  "Construction",
  "Interior",
  "Renovation",
  "Modular Kitchen",
  "Interior Designing/Architectural Planning",
];

export const BUSINESS_OPTIONS = ["spacemanager", "doonearth"];

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, required: true, index: true },
    email: { type: String, trim: true },

    // NOTE: not a fixed enum — admin can add custom top-level statuses
    // (see models/CustomStatus.js). Validity is enforced in the routes.
    status: {
      type: String,
      default: "initialize",
      index: true,
    },

    reason: { type: String },
    followUpDate: { type: Date, index: true },

    // 👇 Client roadmap / journey: call → visit → quotation → decision
    // Decision outcome is captured via status (success = yes, failed = no).
    journeyStage: {
      type: String,
      enum: ["call", "visit", "quotation", "decision"],
      default: "call",
      index: true,
    },

    // 👇 client interest (customer ka interest)
    clientInterest: {
      type: String,
      enum: CLIENT_INTEREST_OPTIONS,
      index: true,
    },

    leadType: {
      type: String,
      enum: ["create", "bulk", "meta"],
      default: "create",
      index: true,
    },

    business: {
      type: String,
      enum: BUSINESS_OPTIONS,
      required: true,
      index: true,
    },

    source: { type: String }, // e.g., "facebook", "instagram", "website"

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

    attachments: [
      {
        url: String,
        public_id: String,
      },
    ],

    // ---- Meta (Lead Ads) tracking ----
    metaLeadId: { type: String, unique: true, sparse: true, index: true },
    metaFormId: { type: String, index: true },
    metaFormName: { type: String },
    metaLeadCreatedAt: { type: Date, index: true },
    metaCampaignId: { type: String },
    metaAdsetId: { type: String },
    metaAdId: { type: String },
    metaFetchedAt: { type: Date, index: true },
    metaRaw: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

leadSchema.index({ createdAt: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ assignedTo: 1 });
leadSchema.index({ followUpDate: 1 });
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ clientInterest: 1 });
leadSchema.index({ business: 1, assignedTo: 1 });

export default mongoose.model("Lead", leadSchema);
