/** Pairing a TV to a screen: short codes the TV shows, and the long key it keeps. */

/** No 0/O, 1/I/L: easy to read off a TV across the room. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const DEVICE_COOKIE = "cv_screen";
/** A paired TV stays paired for 400 days (the longest a browser keeps a cookie); each visit renews it. */
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function pairCode(): string {
  // Reject bytes that would bias the choice.
  const max = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < 6) for (const x of randomBytes(12)) if (x < max && out.length < 6) out += ALPHABET[x % ALPHABET.length];
  return out;
}

/** "k7m-4qx " → "K7M4QX"; null if it can't be a code. */
export function normalizeCode(raw: string): string | null {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 6 && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}

/** 64 hex characters: the TV's key or a pairing secret. */
export function newKey(): string {
  return [...randomBytes(32)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Show a code in two halves: "K7M 4QX". */
export const showCode = (c: string) => `${c.slice(0, 3)} ${c.slice(3)}`;

/** Exit PIN: 4 to 6 digits, or none. */
export function cleanPin(raw: unknown): string | null {
  return typeof raw === "string" && /^\d{4,6}$/.test(raw) ? raw : null;
}
