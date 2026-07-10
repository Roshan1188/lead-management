// src/models/FollowupAudit.js
import mongoose from "mongoose";

const FollowupAuditSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    telecaller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // What happened?
    action: {
      type: String,
      enum: ["status_change", "note", "schedule_change", "update"], // "update" = multi-field change
      required: true,
    },

    // Diffs (keep optional; fill what changed)
    prevStatus: { type: String, enum: ["initialize", "followup", "success", "failed"], default: null },
    newStatus: { type: String, enum: ["initialize", "followup", "success", "failed"], default: null },

    prevReason: { type: String, default: null },
    newReason: { type: String, default: null },

    prevFollowUpDate: { type: Date, default: null },
    newFollowUpDate: { type: Date, default: null },

    // Optional note (free text)
    note: { type: String, default: null },

    // Useful metadata to track who/where
    meta: {
      ip: { type: String, default: null },
      ua: { type: String, default: null },
      source: { type: String, default: "telecaller" }, // e.g., "telecaller", "admin", "api"
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

FollowupAuditSchema.index({ lead: 1, createdAt: -1 });
FollowupAuditSchema.index({ telecaller: 1, createdAt: -1 });

const FollowupAudit = mongoose.model("FollowupAudit", FollowupAuditSchema);
export default FollowupAudit;
