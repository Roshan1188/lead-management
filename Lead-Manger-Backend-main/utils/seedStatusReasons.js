import StatusReason from "../models/StatusReason.js";

const DEFAULTS = [
  { baseStatus: "failed", label: "Switch off", order: 1 },
  { baseStatus: "failed", label: "no response", order: 2 },
  { baseStatus: "failed", label: "busy", order: 3 },
  { baseStatus: "failed", label: "out of range", order: 4 },
  { baseStatus: "failed", label: "budget issue", order: 5 },
];

export async function seedStatusReasons() {
  const count = await StatusReason.estimatedDocumentCount();
  if (count > 0) return;
  await StatusReason.insertMany(DEFAULTS);
  console.log(`✅ Seeded ${DEFAULTS.length} default status reasons`);
}
