import crypto from "crypto";

function secret(): string {
  return process.env.EVENT_TOKEN_SECRET || process.env.CRON_SECRET || "";
}
function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return Buffer.from(t, "base64");
}
export type UnexitAction = "left" | "parked";
export type UnexitTokenPayload = { r: string; a: UnexitAction };

export function signUnexitToken(payload: UnexitTokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = crypto.createHmac("sha256", secret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}
export function verifyUnexitToken(token: string): UnexitTokenPayload | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(b64urlDecode(body).toString("utf8"));
    if (p && typeof p.r === "string" && (p.a === "left" || p.a === "parked")) {
      return p as UnexitTokenPayload;
    }
    return null;
  } catch { return null; }
}
