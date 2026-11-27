/** Join codes: what a salon hands a stylist (typed in, or scanned as a QR code). */

/** No 0/O or 1/I: easy to read off a screen and type. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newJoinCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return [...random(8)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** What someone typed → the stored form (uppercase letters and digits only), or null. */
export function normalizeJoinCode(v: unknown): string | null {
  const c = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{8}$/.test(c) ? c : null;
}

export interface JoinCodeRow {
  revoked_at: string | null;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
}

/** Why a code can't be used now, or null when it can. */
export function codeProblem(c: JoinCodeRow | null, now: Date): string | null {
  if (!c) return "That code isn't right. Check it with the salon.";
  if (c.revoked_at) return "That code was turned off. Ask the salon for a new one.";
  if (c.expires_at && Date.parse(c.expires_at) <= now.getTime()) return "That code has expired. Ask the salon for a new one.";
  if (c.max_uses !== null && c.uses >= c.max_uses) return "That code has been used up. Ask the salon for a new one.";
  return null;
}

/** Roles a salon can give through a code or a request (never owner). */
export const JOIN_ROLES = ["stylist", "renter", "manager", "front_desk"] as const;
export type JoinRole = (typeof JOIN_ROLES)[number];
export const cleanJoinRole = (v: unknown): JoinRole => (JOIN_ROLES.includes(v as JoinRole) ? (v as JoinRole) : "stylist");

/** The link a QR code opens: sign up (or, signed in, join) with the code filled in. */
export const joinLink = (site: string, code: string) => `${site.replace(/\/$/, "")}/signup?code=${code}`;
