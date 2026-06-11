/**
 * Jednoduché session tokeny: base64url(exp) + "." + base64url(HMAC-SHA256(exp)).
 * Klíč se odvozuje z ACCESS_CODE — stačí jeden secret.
 */

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(`ucednikova-noc:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function issueToken(secret: string, now = Date.now()): Promise<string> {
  const exp = String(now + TOKEN_TTL_MS);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(exp));
  return `${b64url(enc.encode(exp))}.${b64url(sig)}`;
}

export async function verifyToken(secret: string, token: string, now = Date.now()): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const expStr = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < now) return false;
    const key = await hmacKey(secret);
    const sig = Uint8Array.from(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    return crypto.subtle.verify("HMAC", key, sig, enc.encode(expStr));
  } catch {
    return false;
  }
}

/** Konstantní porovnání přístupového kódu. */
export function codeMatches(expected: string, given: string): boolean {
  const a = enc.encode(expected);
  const b = enc.encode(given);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
