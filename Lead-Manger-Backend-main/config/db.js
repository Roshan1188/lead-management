import mongoose from "mongoose";
import dns from "dns";

// Some Windows/router DNS setups fail to resolve mongodb+srv SRV records
// via Node's default resolver; fall back to public DNS servers. Not needed
// (and potentially restricted) in Vercel's serverless environment.
if (!process.env.VERCEL) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const connectDB = async () => {
  // Already connected (warm serverless invocation reusing the same container) — skip.
  if (mongoose.connection.readyState === 1) return;

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Indexes are already built; re-verifying them on every cold start is
      // pure overhead in serverless. Only auto-sync in local dev.
      autoIndex: !process.env.VERCEL,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    if (!process.env.VERCEL) process.exit(1);
  }
};

export default connectDB;
