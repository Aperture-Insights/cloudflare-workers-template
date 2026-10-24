// Web-standard APIs only (no node: imports).

export const COOKIE_NAME = "site_auth";

const enc = new TextEncoder();
const MATCH_KEY = "site-auth-v1:password-compare";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(keyMaterial: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(keyMaterial),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function signSession(password: string, expiresAtSec: number): Promise<string> {
  const payload = `v1.${expiresAtSec}`;
  const sig = await hmac(`site-auth-v1:${password}`, payload);
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(
  password: string,
  token: string | null,
  nowSec: number,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const [, expiry, sig] = parts;
  if (!/^\d+$/.test(expiry)) return false;
  const exp = Number(expiry);
  if (!Number.isSafeInteger(exp)) return false;
  const expected = enc.encode(b64url(await hmac(`site-auth-v1:${password}`, `v1.${expiry}`)));
  const given = enc.encode(sig);
  if (!constantTimeEqual(given, expected)) return false;
  return exp > nowSec;
}

export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmac(MATCH_KEY, input), hmac(MATCH_KEY, expected)]);
  return constantTimeEqual(a, b);
}

export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  return raw;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSec: number, secure: boolean): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie("", 0, secure);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
