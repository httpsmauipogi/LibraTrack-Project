import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const sharedDir = path.dirname(fileURLToPath(import.meta.url));
const secretFile = path.join(sharedDir, ".sso_secret");

const loadSecret = () => {
  if (process.env.SSO_SECRET) return process.env.SSO_SECRET;

  try {
    return fs.readFileSync(secretFile, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(32).toString("hex");
    try {
      fs.writeFileSync(secretFile, secret, { mode: 0o600, flag: "wx" });
      return secret;
    } catch {
      return fs.readFileSync(secretFile, "utf8").trim();
    }
  }
};

const secret = loadSecret();
const TOKEN_TTL_MS = 5 * 60 * 1000;

const encode = (value) => Buffer.from(value).toString("base64url");

const sign = (payload) => {
  const body = encode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
};

export const createSsoToken = (email, next = "/") => sign({
  email: String(email).trim().toLowerCase(),
  next,
  exp: Date.now() + TOKEN_TTL_MS,
  nonce: crypto.randomBytes(8).toString("hex")
});

export const verifySsoToken = (token) => {
  if (typeof token !== "string" || !token.includes(".")) return null;

  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length || !crypto.timingSafeEqual(provided, expectedBuffer)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.email !== "string" || typeof payload.next !== "string") return null;
  if (!payload.next.startsWith("/") || payload.next.startsWith("//")) return null;
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;

  return payload;
};
