import mongoose from "mongoose";
import { BUSINESS_OPTIONS } from "./Lead.js";

const metaConfigSchema = new mongoose.Schema(
  {
    business: { type: String, enum: BUSINESS_OPTIONS, required: true, unique: true },
    restrictedTelecallerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    accessTokenEnc: { type: String },
    accessTokenIv: { type: String },
    accessTokenTag: { type: String },
    accessTokenHint: { type: String }, // last 4 chars (for UI hint)
    pageId: { type: String },
    formId: { type: String },
    lastSyncAt: { type: Date, default: null },
    lastSyncFetched: { type: Number, default: 0 },
    lastSyncInserted: { type: Number, default: 0 },
    lastSyncSkipped: { type: Number, default: 0 },
    lastSyncForms: [
      {
        id: { type: String },
        name: { type: String },
        fetched: { type: Number, default: 0 },
        valid: { type: Number, default: 0 },
      },
    ],
    lastSyncFormErrors: [
      {
        id: { type: String },
        name: { type: String },
        error: { type: String },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("MetaConfig", metaConfigSchema);
