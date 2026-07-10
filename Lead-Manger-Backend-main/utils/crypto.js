import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey() {
  const raw = process.env.CONFIG_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error("CONFIG_SECRET missing or too short (min 16 chars)");
  }
  // Derive 32-byte key
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptText(plain) {
  if (!plain) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptText(payload) {
  if (!payload?.enc || !payload?.iv || !payload?.tag) return null;
  const key = getKey();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.enc, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

