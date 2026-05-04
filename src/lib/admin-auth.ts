import { createHmac, timingSafeEqual } from "node:crypto";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "admin@outsider.com")
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin@123";
const ADMIN_TOKEN_SECRET =
  process.env.ADMIN_TOKEN_SECRET ?? "change-this-admin-token-secret";
const ADMIN_TOKEN_TTL_SECONDS = Number(
  process.env.ADMIN_TOKEN_TTL_SECONDS ?? String(60 * 60 * 12)
);

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", ADMIN_TOKEN_SECRET)
    .update(value)
    .digest("base64url");
}

function safeEqualText(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
}

export type AdminTokenPayload = {
  sub: "admin";
  email: string;
  exp: number;
};

export function validateAdminCredentials(email: string, password: string) {
  return (
    safeEqualText(email.trim().toLowerCase(), ADMIN_EMAIL) &&
    safeEqualText(password, ADMIN_PASSWORD)
  );
}

export function createAdminToken() {
  const payload: AdminTokenPayload = {
    sub: "admin",
    email: ADMIN_EMAIL,
    exp: Math.floor(Date.now() / 1000) + Math.max(300, ADMIN_TOKEN_TTL_SECONDS),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload);
  if (!safeEqualText(signature, expected)) return null;

  try {
    const payload = JSON.parse(
      base64UrlDecode(encodedPayload)
    ) as AdminTokenPayload;

    if (payload.sub !== "admin") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export function getAdminEmail() {
  return ADMIN_EMAIL;
}
