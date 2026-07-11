import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    telecaller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Not a fixed enum — admin can add custom top-level statuses (models/CustomStatus.js)
    status: { type: String, required: true },
    reason: { type: String },
    nextFollowDate: { type: Date },
  },
  { timestamps: true }
);

followUpSchema.index({ lead: 1, createdAt: -1 });
followUpSchema.index({ createdAt: 1 });

export default mongoose.model("Followup", followUpSchema);
