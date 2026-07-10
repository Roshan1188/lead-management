// One-time migration: tag existing leads with a `business`, migrate the
// MetaConfig singleton to per-business docs, and pin DoOnEarth leads to the
// designated telecaller. Run once by hand: `node scripts/migrate-business.js`
import dotenv from "dotenv";
import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config();

import connectDB from "../config/db.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import Lead from "../models/Lead.js";
import MetaConfig from "../models/MetaConfig.js";

async function main() {
  await connectDB();

  // 1. Resolve Roshan's telecaller id
  const candidates = await User.find({ role: 1, name: /roshan/i }).select("_id name mobile");
  if (candidates.length !== 1) {
    console.error(`Expected exactly 1 telecaller matching /roshan/i, found ${candidates.length}:`);
    candidates.forEach((c) => console.error(`  - ${c._id} ${c.name} ${c.mobile}`));
    process.exit(1);
  }
  const roshanId = candidates[0]._id;
  console.log(`Resolved Roshan: ${candidates[0].name} (${candidates[0].mobile}) _id=${roshanId}`);

  // 2. Tag leads (order matters: doonearth first, then catch-all)
  const doonRes = await Lead.updateMany(
    { metaFormName: { $regex: /^Doon ES/i } },
    { $set: { business: "doonearth" } }
  );
  console.log(`Tagged doonearth by metaFormName: matched=${doonRes.matchedCount} modified=${doonRes.modifiedCount}`);

  const restRes = await Lead.updateMany(
    { business: { $exists: false } },
    { $set: { business: "spacemanager" } }
  );
  console.log(`Tagged spacemanager (catch-all): matched=${restRes.matchedCount} modified=${restRes.modifiedCount}`);

  // 3. Read-only check before force-correcting assignment
  const doonAssignees = await Lead.find({ business: "doonearth" }).distinct("assignedTo");
  console.log("Current assignees of doonearth leads:", doonAssignees.map(String));

  const assignRes = await Lead.updateMany(
    { business: "doonearth" },
    { $set: { assignedTo: roshanId } }
  );
  console.log(`Re-pointed doonearth leads to Roshan: matched=${assignRes.matchedCount} modified=${assignRes.modifiedCount}`);

  // 4. Migrate MetaConfig singleton -> per-business doc
  const metaRes = await MetaConfig.collection.updateOne(
    { key: "meta" },
    { $set: { business: "doonearth", restrictedTelecallerId: roshanId }, $unset: { key: "" } }
  );
  console.log(`MetaConfig migrated: matched=${metaRes.matchedCount} modified=${metaRes.modifiedCount}`);

  try {
    await MetaConfig.collection.dropIndex("key_1");
    console.log("Dropped stale key_1 index");
  } catch (e) {
    console.log(`No key_1 index to drop (${e.message})`);
  }

  // 5. Final summary
  const counts = await Lead.aggregate([{ $group: { _id: "$business", count: { $sum: 1 } } }]);
  console.log("Final lead counts by business:", counts);

  const untagged = await Lead.countDocuments({ business: { $exists: false } });
  console.log("Leads still untagged (should be 0):", untagged);

  await mongoose.disconnect();
  console.log("DONE");
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
