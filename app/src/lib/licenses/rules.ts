/** Professional licenses: what can be entered, when they expire, and when to remind. */

export const LICENSE_KINDS = [
  { key: "cosmetology", label: "Cosmetology" },
  { key: "barber", label: "Barber" },
  { key: "esthetics", label: "Esthetics" },
  { key: "nails", label: "Nail technician" },
  { key: "instructor", label: "Instructor" },
  { key: "establishment", label: "Salon (establishment)" },
  { key: "other", label: "Other" },
] as const;
export type LicenseKind = (typeof LICENSE_KINDS)[number]["key"];

/** Licenses that let someone do services (these decide "expired" for booking). */
export const PRACTICING: LicenseKind[] = ["cosmetology", "barber", "esthetics", "nails", "other"];

export const kindLabel = (k: string) => LICENSE_KINDS.find((x) => x.key === k)?.label ?? "License";

export const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" ");

export interface LicenseInput {
  kind: string;
  state: string;
  number: string;
  holderName: string;
  expiresOn: string;
}

export interface LicenseFields {
  kind: LicenseKind;
  state: string;
  number: string;
  holder_name: string | null;
  expires_on: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function cleanLicense(raw: unknown, opts: { establishment: boolean }): { ok: true; value: LicenseFields } | { ok: false; error: string } {
  const r = (raw ?? {}) as Partial<LicenseInput>;
  const kind = LICENSE_KINDS.find((k) => k.key === r.kind)?.key;
  if (!kind) return { ok: false, error: "Pick the type of license." };
  if (opts.establishment !== (kind === "establishment")) return { ok: false, error: opts.establishment ? "This is for the salon's own license." : "Pick your license type (the salon license goes under the salon)." };
  const state = String(r.state ?? "").toUpperCase();
  if (!US_STATES.includes(state)) return { ok: false, error: "Pick the state that issued it." };
  const number = String(r.number ?? "").trim().replace(/\s+/g, " ");
  if (!number || number.length > 40) return { ok: false, error: "Enter the license number as it's printed." };
  const expires = String(r.expiresOn ?? "").trim();
  if (expires && (!DATE.test(expires) || Number.isNaN(Date.parse(`${expires}T12:00:00Z`)))) return { ok: false, error: "Enter the expiration date." };
  if (expires && (expires < "2000-01-01" || expires > "2100-01-01")) return { ok: false, error: "Check the expiration date." };
  const holder = String(r.holderName ?? "").trim().slice(0, 100);
  return { ok: true, value: { kind, state, number, holder_name: holder || null, expires_on: expires || null } };
}

/** Whole days from today until the expiry date (negative once expired). */
export function daysLeft(expiresOn: string, today: string): number {
  return Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export type LicenseStatus = "valid" | "soon" | "expired" | "no-date";

/** Expired after its date; "soon" within 60 days. */
export function licenseStatus(expiresOn: string | null, today: string): LicenseStatus {
  if (!expiresOn) return "no-date";
  const d = daysLeft(expiresOn, today);
  if (d < 0) return "expired";
  return d <= 60 ? "soon" : "valid";
}

/** Reminder days before expiry (0 = the day it expires). */
export const REMINDER_DAYS = [90, 60, 30, 7, 0] as const;

/** The reminder due today for this expiry, if any. */
export function reminderDue(expiresOn: string | null, today: string): (typeof REMINDER_DAYS)[number] | null {
  if (!expiresOn) return null;
  const d = daysLeft(expiresOn, today);
  return (REMINDER_DAYS as readonly number[]).includes(d) ? (d as (typeof REMINDER_DAYS)[number]) : null;
}

export function reminderText(kind: string, state: string, expiresOn: string, days: number, who: "you" | string): string {
  const what = `${who === "you" ? "Your" : `${who}'s`} ${state} ${kindLabel(kind).toLowerCase()} license`;
  const when = new Date(`${expiresOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (days === 0) return `${what} expires today (${when}). Renew it with the state board, then update it in Chairvana (Licenses).`;
  return `${what} expires in ${days} days, on ${when}. Renew it with the state board, then update it in Chairvana (Licenses).`;
}

/**
 * The date that decides whether someone may be booked: the latest expiry among
 * their practicing licenses. null when none has a date (nothing to enforce).
 */
export function bookingExpiry(list: { kind: string; expires_on: string | null }[]): string | null {
  const dates = list.filter((l) => (PRACTICING as string[]).includes(l.kind) && l.expires_on).map((l) => l.expires_on!);
  return dates.length ? dates.sort().at(-1)! : null;
}

/** A web search for the state board's license lookup (each state's site differs and moves). */
export function lookupLink(state: string, kind: string): string {
  const board = kind === "barber" ? "barber" : kind === "establishment" ? "salon establishment" : "cosmetology";
  return `https://www.google.com/search?q=${encodeURIComponent(`${state} ${board} board license lookup`)}`;
}
