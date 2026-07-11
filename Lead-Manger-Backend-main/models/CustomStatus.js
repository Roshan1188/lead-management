import mongoose from "mongoose";

// Admin-defined top-level statuses in addition to the built-in
// initialize / followup / success / failed.
const customStatusSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("CustomStatus", customStatusSchema);
