import type { Hours } from "../context";

/** A team member who can take appointments. */
export interface Stylist {
  id: string;
  name: string;
  role: string;
  /** Calendar accent (always shown with the name, never color alone). */
  color: string;
  /** Their own weekly hours; null = the salon's hours. */
  hours: Hours | null;
  /** Services they offer; null = all. */
  serviceIds: string[] | null;
  bookable: boolean;
  title: string | null;
  /** Their own price (cents) and working time (minutes) per service id, when the salon allows it. */
  own: OwnPrices;
}

export type OwnPrices = Record<string, { price?: number; active?: number }>;

/** Categorical palette, assigned in order (light-mode steps; validated for adjacent CVD separation). */
export const STYLIST_COLORS = ["#257de0", "#f47230", "#00b894", "#f2a600", "#ee7fac", "#008a17", "#6a4ce2", "#ec4647"];

export interface StaffRow {
  id: string;
  display_name: string;
  role: string;
  color: string | null;
  hours: Hours | null;
  service_ids: string[] | null;
  bookable: boolean;
  title: string | null;
  sort: number;
  active: boolean;
  service_prices?: unknown;
  /** Suspended (e.g. leave): not bookable, not listed. */
  suspended_at?: string | null;
  /** Latest expiry among their practicing licenses (null: none on file). */
  license_expires_on?: string | null;
  /** Salon switches joined in STAFF_COLS: own prices, and not booking expired licenses. */
  businesses?: { stylist_pricing?: boolean; block_expired_license?: boolean } | null;
}

export const STAFF_COLS = "id,display_name,role,color,hours,service_ids,bookable,title,sort,active,suspended_at,license_expires_on,service_prices,businesses(stylist_pricing,block_expired_license)";

/** Stored own prices, cleaned: whole cents up to $100,000 and 1–720 minutes; anything else is dropped. */
export function cleanOwnPrices(raw: unknown): OwnPrices {
  const out: OwnPrices = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !v || typeof v !== "object") continue;
    const { price, active } = v as Record<string, unknown>;
    const p = Number.isInteger(price) && (price as number) >= 0 && (price as number) <= 10_000_000 ? (price as number) : undefined;
    const a = Number.isInteger(active) && (active as number) >= 1 && (active as number) <= 720 ? (active as number) : undefined;
    if (p !== undefined || a !== undefined) out[id] = { ...(p !== undefined ? { price: p } : {}), ...(a !== undefined ? { active: a } : {}) };
  }
  return out;
}

/** The salon doesn't book stylists whose license has expired, and this one's has. */
function licenseLapsed(r: StaffRow): boolean {
  return !!r.businesses?.block_expired_license && !!r.license_expires_on && r.license_expires_on < new Date().toISOString().slice(0, 10);
}

/** Rows → stylists, in display order, with colors filled in by position. */
export function toStylists(rows: StaffRow[], opts: { includeUnbookable?: boolean } = {}): Stylist[] {
  return rows
    .filter((r) => r.active && !r.suspended_at && (opts.includeUnbookable || r.bookable) && !licenseLapsed(r))
    .sort((a, b) => a.sort - b.sort)
    .map((r, i) => ({
      id: r.id,
      name: r.display_name,
      role: r.role,
      color: r.color ?? STYLIST_COLORS[i % STYLIST_COLORS.length],
      hours: r.hours && Object.keys(r.hours).length ? r.hours : null,
      serviceIds: r.service_ids && r.service_ids.length ? r.service_ids : null,
      bookable: r.bookable,
      title: r.title,
      own: r.businesses?.stylist_pricing ? cleanOwnPrices(r.service_prices) : {},
    }));
}

export const hoursFor = (s: Pick<Stylist, "hours"> | null | undefined, salon: Hours): Hours => s?.hours ?? salon;

/** Whether a stylist offers every one of these services. */
export const offersAll = (s: Pick<Stylist, "serviceIds">, serviceIds: string[]) => !s.serviceIds || serviceIds.every((id) => s.serviceIds!.includes(id));

/** Stylists who can do all of these services. */
export const whoOffers = (list: Stylist[], serviceIds: string[]) => list.filter((s) => offersAll(s, serviceIds));

/** Default stylist for a new booking: the one being viewed, else yourself if you take appointments, else the first. */
export function defaultStylist(list: Stylist[], viewStaff: string | null, me: string): string | null {
  if (viewStaff && list.some((s) => s.id === viewStaff)) return viewStaff;
  if (list.some((s) => s.id === me)) return me;
  return list[0]?.id ?? null;
}

/**
 * Services as this stylist does them: their own price and working time where
 * they have one, the menu's otherwise. Works on booking services (price in
 * dollars) and keeps everything else as it was.
 */
export function asDoneBy<T extends { id: string; price: number; active: number }>(services: T[], s: Pick<Stylist, "own"> | null | undefined): T[] {
  if (!s || !Object.keys(s.own).length) return services;
  return services.map((x) => {
    const o = s.own[x.id];
    if (!o) return x;
    return { ...x, ...(o.price !== undefined ? { price: o.price / 100 } : {}), ...(o.active !== undefined ? { active: o.active } : {}) };
  });
}

/** First name only, for compact calendar labels. */
export const firstName = (n: string) => n.split(/\s+/)[0];
