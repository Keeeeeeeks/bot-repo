import { createHmac, timingSafeEqual } from "crypto";

export interface TokenPayload {
  email: string;
  exp: number; // ms
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export function signToken(email: string, secret: string, ttlMs: number): string {
  const payload: TokenPayload = { email, exp: Date.now() + ttlMs };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): TokenPayload {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("malformed token");
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = b64urlDecode(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new Error("invalid signature");
  }
  const payload = JSON.parse(b64urlDecode(body).toString()) as TokenPayload;
  if (Date.now() > payload.exp) throw new Error("token expired");
  return payload;
}

export function adminAllowList(): string[] {
  return (process.env.ADMIN_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email: string): boolean {
  return adminAllowList().includes(email.toLowerCase());
}
