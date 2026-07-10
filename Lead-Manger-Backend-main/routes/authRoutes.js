// routes/auth.js (only the login part changed)
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";
import cloudinary from "../utils/cloudinary.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

const sign = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Simulate sending OTP (hardcoded 123456)
router.post("/send-otp", async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ message: "mobile required" });
  return res.json({ sent: true, otp: "123456" });
});

// ✅ Login with mobile + OTP, but block check
router.post("/login", async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    if (!mobile || !otp) return res.status(400).json({ message: "mobile & otp required" });
    if (otp !== "123456") return res.status(400).json({ message: "Invalid OTP" });

    const user = await User.findOne({ mobile });
    if (!user) return res.status(404).json({ message: "User not found. Ask admin to create your account." });

    if (user.blocked) {
      return res.status(403).json({
        message: "Your account has been blocked by admin.",
        reason: user.blockedReason || null,
      });
    }

    const token = sign(user);
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ message: "Login error", error: e.message });
  }
});

// /me and /profile unchanged (you already have)
router.get("/me", protect, async (req, res) => {
  res.json(req.user);
});

router.put("/profile", protect, upload.single("avatar"), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.body.name) user.name = req.body.name;

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "users" },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(req.file.buffer);
      });
      user.avatarUrl = result.secure_url;
    }

    await user.save();
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: "Profile update failed", error: e.message });
  }
});

export default router;
