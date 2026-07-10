import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes, { startMetaAutoSyncJob } from "./routes/adminRoutes.js";
import telecallerRoutes from "./routes/telecallerRoutes.js";
import leadRoutes from "./routes/leadRoutes.js";

dotenv.config();
await connectDB();

const app = express();

/* ------------------ Security Middlewares ------------------ */
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        "https://lead-manager-frontend-ten.vercel.app", // ✅ your frontend URL
      ];
      if (!origin || allowedOrigins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // ✅ allows cookies or auth headers
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("dev"));

/* ------------------ Rate Limiting ------------------ */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 1000,
});
app.use(limiter);

/* ------------------ Health Check ------------------ */
app.get("/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

/* ------------------ API Routes ------------------ */
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/telecaller", telecallerRoutes);
app.use("/api/v1/leads", leadRoutes);

// Auto-sync Meta leads every 30 minutes (configurable via env).
startMetaAutoSyncJob();

/* ------------------ 404 Handler ------------------ */
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

/* ------------------ Start Server ------------------ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running http://localhost:${PORT}`));
