import type { MenuService } from "../schedule/plan";
import { addDays, weekday, type DateStr } from "../time/zone";
import { availableStarts, type BookingSettings, type Hours, type Interval } from "./availability";

/** Time of day the appointment should start in (salon time). */
export type TimeBlock = "any" | "morning" | "afternoon" | "evening" | { from: number; to: number };

export const TIME_BLOCKS: { key: Exclude<TimeBlock, object>; label: string; range: [number, number] }[] = [
  { key: "any", label: "Any time", range: [0, 1440] },
  { key: "morning", label: "Morning (before noon)", range: [0, 12 * 60] },
  { key: "afternoon", label: "Afternoon (12–5)", range: [12 * 60, 17 * 60] },
  { key: "evening", label: "Evening (after 5)", range: [17 * 60, 1440] },
];

export function blockRange(b: TimeBlock): [number, number] {
  if (typeof b === "object") return [b.from, b.to];
  return TIME_BLOCKS.find((t) => t.key === b)!.range;
}

/** Where to start looking. */
export type StartMode =
  | { kind: "next" }
  /** Around N weeks from today: that day first, then ±1, ±2, ±3 days. */
  | { kind: "weeks"; weeks: number }
  | { kind: "date"; date: DateStr };

export interface SearchCriteria {
  /** 0 = Sunday … 6 = Saturday; empty = any day. */
  weekdays: number[];
  block: TimeBlock;
  start: StartMode;
}

export const WEEKS_OUT = [2, 4, 6, 8] as const;

export interface Opening {
  date: DateStr;
  minutes: number; // start, salon time
}

export interface SearchInput {
  services: MenuService[];
  criteria: SearchCriteria;
  today: DateStr;
  tz: string;
  hours: Hours;
  isClosed: (d: DateStr) => boolean;
  /** Busy time across the whole search window. */
  busy: Interval[];
  now: Date;
  settings: BookingSettings;
  /** Furthest day to look (days from today). */
  horizonDays: number;
  limit?: number;
  perDay?: number;
}

/** Days to check, in the order results should be listed. */
export function searchDays(start: StartMode, today: DateStr, horizonDays: number): DateStr[] {
  const last = addDays(today, horizonDays);
  if (start.kind === "weeks") {
    const target = addDays(today, start.weeks * 7);
    const out: DateStr[] = [target];
    for (let k = 1; k <= 3; k++) out.push(addDays(target, -k), addDays(target, k));
    return out.filter((d) => d >= today && d <= last);
  }
  const from = start.kind === "date" && start.date > today ? start.date : today;
  const out: DateStr[] = [];
  for (let d = from; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The [from, to) window to load busy time for. */
export function searchWindow(start: StartMode, today: DateStr, horizonDays: number): { first: DateStr; last: DateStr } {
  const days = searchDays(start, today, horizonDays);
  const sorted = [...days].sort();
  return { first: sorted[0] ?? today, last: sorted[sorted.length - 1] ?? today };
}

/** Openings matching the criteria, earliest-relevant first. */
export function findOpenings(i: SearchInput): Opening[] {
  const limit = i.limit ?? 20;
  const perDay = i.perDay ?? 6;
  const [from, to] = blockRange(i.criteria.block);
  const out: Opening[] = [];
  for (const date of searchDays(i.criteria.start, i.today, i.horizonDays)) {
    if (out.length >= limit) break;
    if (i.criteria.weekdays.length && !i.criteria.weekdays.includes(weekday(date))) continue;
    if (i.isClosed(date)) continue;
    const starts = availableStarts({ date, tz: i.tz, hours: i.hours, services: i.services, busy: i.busy, now: i.now, settings: i.settings })
      .filter((m) => m >= from && m < to)
      .slice(0, perDay);
    for (const m of starts) {
      if (out.length >= limit) break;
      out.push({ date, minutes: m });
    }
  }
  return out;
}

/** A client's saved favorites (also used to pre-fill the stylist's search). */
export interface Favorites {
  serviceIds: string[];
  weekdays: number[];
  block: TimeBlock;
}

export function cleanFavorites(raw: unknown): Favorites | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Favorites>;
  const weekdays = Array.isArray(r.weekdays) ? [...new Set(r.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  const serviceIds = Array.isArray(r.serviceIds) ? r.serviceIds.filter((s) => typeof s === "string").slice(0, 8) : [];
  let block: TimeBlock = "any";
  if (typeof r.block === "string" && TIME_BLOCKS.some((t) => t.key === r.block)) block = r.block;
  else if (r.block && typeof r.block === "object" && Number.isInteger(r.block.from) && Number.isInteger(r.block.to) && r.block.from >= 0 && r.block.to <= 1440 && r.block.from < r.block.to)
    block = { from: r.block.from, to: r.block.to };
  if (!serviceIds.length && !weekdays.length && block === "any") return null;
  return { serviceIds, weekdays, block };
}
