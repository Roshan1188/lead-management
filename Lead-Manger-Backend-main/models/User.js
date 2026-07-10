// models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    mobile: { type: String, required: true, unique: true, index: true },
    role: { type: Number, enum: [1, 2], required: true }, // 1=Telecaller, 2=Admin
    password: { type: String, default: "123456" },
    avatarUrl: { type: String },

    // 🔒 block controls
    blocked: { type: Boolean, default: false },
    blockedReason: { type: String, trim: true, default: null },
    blockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

export default mongoose.model("User", userSchema);
