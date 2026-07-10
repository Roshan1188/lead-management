import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.split(" ")[1] : null;
    if (!token) return res.status(401).json({ message: "Not authorized, no token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Not authorized", error: err.message });
  }
};

export const requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Not authorized" });
  if (req.user.role !== role) return res.status(403).json({ message: "Forbidden" });
  next();
};
