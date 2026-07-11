import mongoose from "mongoose";

export const STATUS_REASON_BASE_STATUSES = ["followup", "success", "failed"];

const statusReasonSchema = new mongoose.Schema(
  {
    baseStatus: { type: String, enum: STATUS_REASON_BASE_STATUSES, required: true, index: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

statusReasonSchema.index({ baseStatus: 1, label: 1 }, { unique: true });

export default mongoose.model("StatusReason", statusReasonSchema);
