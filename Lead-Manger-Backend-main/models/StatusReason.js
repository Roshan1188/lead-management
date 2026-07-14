import mongoose from "mongoose";

export const STATUS_REASON_BASE_STATUSES = ["followup", "success", "failed"];

const statusReasonSchema = new mongoose.Schema(
  {
    // Built-in statuses (followup / success / failed) OR the slug of an
    // admin-created custom status (e.g. "call_back", "waiting").
    baseStatus: { type: String, required: true, trim: true, lowercase: true, index: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

statusReasonSchema.index({ baseStatus: 1, label: 1 }, { unique: true });

export default mongoose.model("StatusReason", statusReasonSchema);
