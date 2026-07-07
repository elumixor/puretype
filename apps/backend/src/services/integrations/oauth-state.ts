import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "env";

// A short-lived signed token that survives the OAuth redirect round-trip. The
// provider echoes it back on the callback (which has no Authorization header),
// letting us attach the connected account to the right user without a session.

const STATE_TTL_MS = 1000 * 60 * 10; // 10 minutes

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function sign(payload: string): Buffer {
  return createHmac("sha256", env.SESSION_SECRET).update(payload).digest();
}

export function signState(userId: string): string {
  const payload = b64url(Buffer.from(JSON.stringify({ userId, exp: Date.now() + STATE_TTL_MS })));
  return `${payload}.${b64url(sign(payload))}`;
}

export function verifyState(state: string): { userId: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const actual = b64urlDecode(sig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const { userId, exp } = JSON.parse(b64urlDecode(payload).toString("utf8")) as { userId: string; exp: number };
    if (!exp || Date.now() > exp) return null;
    return { userId };
  } catch {
    return null;
  }
}
