import type { Opening, SearchCriteria } from "../booking/search";
import { formatDay, formatMinutes, type DateStr } from "../time/zone";

/** One waitlist entry, as the scheduler sees it. */
export interface WaitEntry {
  id: string;
  clientId: string;
  staffId: string | null;
  serviceIds: string[];
  /** 0 = Sunday … 6 = Saturday; empty = any day. */
  weekdays: number[];
  /** Start-time window, minutes after midnight (salon time). */
  timeFrom: number;
  timeTo: number;
  dateFrom: DateStr;
  dateTo: DateStr;
  lastOfferedAt: Date | null;
  lastOfferedSlots: string[];
  createdAt: Date;
}

/** At most one offer per entry in this many hours. */
export const OFFER_GAP_HOURS = 20;
/** Openings listed in one offer. */
export const OFFER_SIZE = 3;

export const slotKey = (o: Opening) => `${o.date} ${o.minutes}`;

/** Search criteria for an entry, starting no earlier than today. */
export function entryCriteria(e: WaitEntry, today: DateStr): SearchCriteria {
  return {
    weekdays: e.weekdays,
    block: e.timeFrom === 0 && e.timeTo === 1440 ? "any" : { from: e.timeFrom, to: e.timeTo },
    start: { kind: "date", date: e.dateFrom > today ? e.dateFrom : today },
  };
}

/** Openings inside the entry's dates, days and times. */
export function matchingOpenings(e: WaitEntry, openings: Opening[]): Opening[] {
  return openings
    .filter((o) => o.date >= e.dateFrom && o.date <= e.dateTo)
    .filter((o) => !e.weekdays.length || e.weekdays.includes(new Date(`${o.date}T12:00:00Z`).getUTCDay()))
    .filter((o) => o.minutes >= e.timeFrom && o.minutes < e.timeTo)
    .sort((a, b) => a.date.localeCompare(b.date) || a.minutes - b.minutes);
}

/**
 * What to offer now, or null. Offers go out at most once per OFFER_GAP_HOURS,
 * and only when at least one opening wasn't in the last offer.
 */
export function offerFor(e: WaitEntry, openings: Opening[], now: Date): Opening[] | null {
  const list = matchingOpenings(e, openings).slice(0, OFFER_SIZE);
  if (!list.length) return null;
  if (e.lastOfferedAt && now.getTime() - e.lastOfferedAt.getTime() < OFFER_GAP_HOURS * 3_600_000) return null;
  const before = new Set(e.lastOfferedSlots);
  if (list.every((o) => before.has(slotKey(o)))) return null;
  return list;
}

/** The entry is done when the client has booked any of its services inside its dates, after joining. */
export function isFulfilled(e: WaitEntry, appts: { clientId: string; date: DateStr; serviceIds: string[]; createdAt: Date }[]): boolean {
  return appts.some(
    (a) => a.clientId === e.clientId && a.date >= e.dateFrom && a.date <= e.dateTo && a.createdAt >= e.createdAt && a.serviceIds.some((s) => e.serviceIds.includes(s)),
  );
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Fri, Sat · 9:00 AM–12:00 PM · Dec 1 – Dec 31" */
export function describeWindow(e: Pick<WaitEntry, "weekdays" | "timeFrom" | "timeTo" | "dateFrom" | "dateTo">): string {
  const days = e.weekdays.length ? [...e.weekdays].sort().map((d) => DAY[d]).join(", ") : "Any day";
  const named: Record<string, string> = { "0-1440": "any time", "0-720": "mornings", "720-1020": "afternoons", "1020-1440": "evenings" };
  const times = named[`${e.timeFrom}-${e.timeTo}`] ?? (e.timeTo === 1440 ? `after ${formatMinutes(e.timeFrom)}` : e.timeFrom === 0 ? `before ${formatMinutes(e.timeTo)}` : `${formatMinutes(e.timeFrom)}–${formatMinutes(e.timeTo)}`);
  const fmt = (d: DateStr) => formatDay(d, { month: "short", day: "numeric" });
  return `${days} · ${times} · ${fmt(e.dateFrom)} – ${fmt(e.dateTo)}`;
}

/** "Fri, Dec 4 at 10:00 AM, Sat, Dec 5 at 9:30 AM" */
export function listOpenings(list: Opening[], tzLabel = ""): string {
  return list.map((o) => `${formatDay(o.date, { weekday: "short", month: "short", day: "numeric" })} at ${formatMinutes(o.minutes)}${tzLabel ? ` ${tzLabel}` : ""}`).join(", ");
}
