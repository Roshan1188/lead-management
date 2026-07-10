import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    telecaller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["initialize", "followup", "failed", "success"], required: true },
    reason: { type: String },
    nextFollowDate: { type: Date },
  },
  { timestamps: true }
);

followUpSchema.index({ lead: 1, createdAt: -1 });
followUpSchema.index({ createdAt: 1 });

export default mongoose.model("Followup", followUpSchema);
