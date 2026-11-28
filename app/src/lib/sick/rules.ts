/**
 * Sick days: the salon's choices (substitutes, discounts, who pays, stacking),
 * which option a new time counts as, and the discount it earns.
 */
import { wallParts } from "../time/zone";

/** The ways a client can rebook when their stylist is out. */
export const SICK_OPTIONS = [
  { key: "sameWindowOther", label: "Someone else, same time", hint: "Another stylist, the same day, within the same window" },
  { key: "sameDayOther", label: "Someone else, same day", hint: "Another stylist, the same day, a different time" },
  { key: "otherDaySame", label: "Same stylist, another day", hint: "Wait for their stylist to be back" },
  { key: "otherDayOther", label: "Someone else, another day", hint: "Another stylist on a different day" },
] as const;
export type SickOptionKey = (typeof SICK_OPTIONS)[number]["key"];

export interface SickOption {
  on: boolean;
  kind: "amount" | "percent";
  /** Cents for "amount", whole percent for "percent". */
  value: number;
  /** Share the salon pays (0–100); the stylist pays the rest. */
  salonShare: number;
}

export interface SickSettings {
  /** Offer other stylists (who do the services and have openings). */
  substitutes: boolean;
  /** Give discounts at all (each option also has its own switch). */
  discounts: boolean;
  options: Record<SickOptionKey, SickOption>;
  /** Can a sick-day discount combine with promo codes and package savings? */
  stack: boolean;
  /** "Same window": within this many minutes of the original start. */
  windowMinutes: number;
  /** Close a link this many hours before the original start (0 = at the start). */
  closeHoursBefore: number;
}

export const DEFAULT_SICK: SickSettings = {
  substitutes: true,
  discounts: false,
  options: {
    sameWindowOther: { on: true, kind: "amount", value: 500, salonShare: 100 },
    sameDayOther: { on: true, kind: "amount", value: 1000, salonShare: 100 },
    otherDaySame: { on: true, kind: "percent", value: 20, salonShare: 50 },
    otherDayOther: { on: true, kind: "percent", value: 10, salonShare: 100 },
  },
  stack: false,
  windowMinutes: 60,
  closeHoursBefore: 0,
};

const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

export function cleanSickSettings(raw: unknown): SickSettings {
  const r = (raw ?? {}) as Partial<SickSettings>;
  const opts = (r.options ?? {}) as Partial<Record<SickOptionKey, Partial<SickOption>>>;
  const options = Object.fromEntries(
    SICK_OPTIONS.map(({ key }) => {
      const d = DEFAULT_SICK.options[key];
      const o = opts[key] ?? {};
      const kind = o.kind === "percent" || o.kind === "amount" ? o.kind : d.kind;
      return [key, { on: typeof o.on === "boolean" ? o.on : d.on, kind, value: int(o.value, 0, kind === "percent" ? 100 : 100_000, d.value), salonShare: int(o.salonShare, 0, 100, d.salonShare) }];
    }),
  ) as Record<SickOptionKey, SickOption>;
  return {
    substitutes: typeof r.substitutes === "boolean" ? r.substitutes : DEFAULT_SICK.substitutes,
    discounts: typeof r.discounts === "boolean" ? r.discounts : DEFAULT_SICK.discounts,
    options,
    stack: typeof r.stack === "boolean" ? r.stack : DEFAULT_SICK.stack,
    windowMinutes: int(r.windowMinutes, 15, 240, DEFAULT_SICK.windowMinutes),
    closeHoursBefore: int(r.closeHoursBefore, 0, 48, DEFAULT_SICK.closeHoursBefore),
  };
}

/** Which option a new time is (null: not allowed, e.g. the sick stylist the same day). */
export function classify(i: { origStart: Date; origStaff: string; start: Date; staff: string; tz: string; windowMinutes: number }): SickOptionKey | null {
  const sameDay = wallParts(i.origStart, i.tz).date === wallParts(i.start, i.tz).date;
  const sameStylist = i.staff === i.origStaff;
  if (sameStylist) return sameDay ? null : "otherDaySame";
  if (!sameDay) return "otherDayOther";
  return Math.abs(i.start.getTime() - i.origStart.getTime()) <= i.windowMinutes * 60_000 ? "sameWindowOther" : "sameDayOther";
}

/** Whether this option can be offered at all. */
export function optionAllowed(s: SickSettings, key: SickOptionKey): boolean {
  return key === "otherDaySame" || s.substitutes;
}

/** The discount (cents) an option earns on a subtotal, and who pays it. */
export function sickDiscount(s: SickSettings, key: SickOptionKey, subtotalCents: number): { cents: number; salon: number; stylist: number } {
  const o = s.options[key];
  if (!s.discounts || !o.on || o.value <= 0 || subtotalCents <= 0) return { cents: 0, salon: 0, stylist: 0 };
  const cents = Math.min(subtotalCents, o.kind === "percent" ? Math.round((subtotalCents * o.value) / 100) : o.value);
  const salon = Math.round((cents * o.salonShare) / 100);
  return { cents, salon, stylist: cents - salon };
}

export const optionBadge = (s: SickSettings, key: SickOptionKey): string | null => {
  const o = s.options[key];
  if (!s.discounts || !o.on || o.value <= 0) return null;
  return o.kind === "percent" ? `${o.value}% off` : `$${(o.value / 100).toFixed(o.value % 100 ? 2 : 0)} off`;
};

export interface PricedLine {
  service_id: string;
  list_price_cents: number;
  price_quoted_cents: number;
  discounts: { source: string; label: string; amount_cents: number }[];
}

/**
 * Put a sick-day discount on the lines. Stacking: on top of other savings.
 * Not stacking: it replaces them only when it's bigger (the client gets the
 * better one). Returns the lines and how much of it was applied.
 */
export function applySickDiscount<T extends PricedLine>(lines: T[], cents: number, stack: boolean, label = "Sorry for the change"): { lines: T[]; applied: number } {
  if (cents <= 0 || !lines.length) return { lines, applied: 0 };
  const other = lines.reduce((n, l) => n + (l.list_price_cents - l.price_quoted_cents), 0);
  if (!stack && cents <= other) return { lines, applied: 0 };
  const base = lines.map((l) => (stack ? l.price_quoted_cents : l.list_price_cents));
  const total = base.reduce((a, b) => a + b, 0);
  const off = Math.min(cents, total);
  let left = off;
  const out = lines.map((l, i) => {
    const share = i === lines.length - 1 ? left : Math.min(left, Math.round((off * base[i]) / Math.max(1, total)));
    left -= share;
    const entry = { source: "sick_day", label, amount_cents: share };
    return { ...l, price_quoted_cents: base[i] - share, discounts: [...(stack ? l.discounts : []), ...(share ? [entry] : [])] };
  });
  return { lines: out, applied: off };
}
