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
}

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
}

export const STAFF_COLS = "id,display_name,role,color,hours,service_ids,bookable,title,sort,active";

/** Rows → stylists, in display order, with colors filled in by position. */
export function toStylists(rows: StaffRow[], opts: { includeUnbookable?: boolean } = {}): Stylist[] {
  return rows
    .filter((r) => r.active && (opts.includeUnbookable || r.bookable))
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

/** First name only, for compact calendar labels. */
export const firstName = (n: string) => n.split(/\s+/)[0];
