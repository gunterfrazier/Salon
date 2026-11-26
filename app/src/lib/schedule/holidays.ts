import { addDays, weekday, zonedToUtc, type DateStr } from "../time/zone";

/**
 * Yearly holiday rules. A holiday that's switched on closes the salon for the
 * whole day: online booking skips it, and stylist bookings need a confirm.
 */
export type HolidayDate =
  /** Same date every year, e.g. Dec 25. */
  | { type: "fixed"; month: number; day: number }
  /**
   * nth weekday of a month (n = 1–4), or the last one (n = -1). weekday: 0 = Sun.
   * plusDays shifts the result (Day after Thanksgiving = 4th Thursday + 1).
   */
  | { type: "nth"; month: number; weekday: number; n: number; plusDays?: number }
  /** Days from Easter Sunday (0 = Easter, -2 = Good Friday). */
  | { type: "easter"; offset: number };

export interface HolidayRule {
  key: string;
  name: string;
  date: HolidayDate;
  closed: boolean;
  custom?: boolean;
}

export const PRESET_HOLIDAYS: HolidayRule[] = [
  { key: "new_years_day", name: "New Year's Day", date: { type: "fixed", month: 1, day: 1 }, closed: true },
  { key: "mlk_day", name: "Martin Luther King Jr. Day", date: { type: "nth", month: 1, weekday: 1, n: 3 }, closed: false },
  { key: "valentines_day", name: "Valentine's Day", date: { type: "fixed", month: 2, day: 14 }, closed: false },
  { key: "presidents_day", name: "Presidents' Day", date: { type: "nth", month: 2, weekday: 1, n: 3 }, closed: false },
  { key: "good_friday", name: "Good Friday", date: { type: "easter", offset: -2 }, closed: false },
  { key: "easter", name: "Easter Sunday", date: { type: "easter", offset: 0 }, closed: false },
  { key: "mothers_day", name: "Mother's Day", date: { type: "nth", month: 5, weekday: 0, n: 2 }, closed: false },
  { key: "memorial_day", name: "Memorial Day", date: { type: "nth", month: 5, weekday: 1, n: -1 }, closed: true },
  { key: "juneteenth", name: "Juneteenth", date: { type: "fixed", month: 6, day: 19 }, closed: false },
  { key: "fathers_day", name: "Father's Day", date: { type: "nth", month: 6, weekday: 0, n: 3 }, closed: false },
  { key: "independence_day", name: "Independence Day", date: { type: "fixed", month: 7, day: 4 }, closed: true },
  { key: "labor_day", name: "Labor Day", date: { type: "nth", month: 9, weekday: 1, n: 1 }, closed: true },
  { key: "veterans_day", name: "Veterans Day", date: { type: "fixed", month: 11, day: 11 }, closed: false },
  { key: "thanksgiving", name: "Thanksgiving", date: { type: "nth", month: 11, weekday: 4, n: 4 }, closed: true },
  { key: "black_friday", name: "Day after Thanksgiving", date: { type: "nth", month: 11, weekday: 4, n: 4, plusDays: 1 }, closed: true },
  { key: "christmas_eve", name: "Christmas Eve", date: { type: "fixed", month: 12, day: 24 }, closed: true },
  { key: "christmas", name: "Christmas Day", date: { type: "fixed", month: 12, day: 25 }, closed: true },
  { key: "new_years_eve", name: "New Year's Eve", date: { type: "fixed", month: 12, day: 31 }, closed: false },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number): DateStr => `${y}-${pad(m)}-${pad(d)}`;

/** Easter Sunday (Gregorian), anonymous algorithm. */
export function easterSunday(year: number): DateStr {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The date a rule falls on in a given year (null if it doesn't exist, e.g. Feb 30). */
export function holidayDate(rule: HolidayRule, year: number): DateStr | null {
  const r = rule.date;
  switch (r.type) {
    case "fixed":
      return r.day >= 1 && r.day <= daysInMonth(year, r.month) ? ymd(year, r.month, r.day) : null;
    case "nth": {
      let d: DateStr;
      if (r.n === -1) {
        const last = ymd(year, r.month, daysInMonth(year, r.month));
        d = addDays(last, -((weekday(last) - r.weekday + 7) % 7));
      } else {
        const first = ymd(year, r.month, 1);
        d = addDays(first, ((r.weekday - weekday(first) + 7) % 7) + (r.n - 1) * 7);
        if (Number(d.slice(5, 7)) !== r.month) return null;
      }
      return r.plusDays ? addDays(d, r.plusDays) : d;
    }
    case "easter":
      return addDays(easterSunday(year), r.offset);
  }
}

/** The closed holiday on a date, if any. */
export function holidayOn(date: DateStr, rules: HolidayRule[]): HolidayRule | null {
  const year = Number(date.slice(0, 4));
  return rules.find((r) => r.closed && holidayDate(r, year) === date) ?? null;
}

/** Next date (on or after `from`) a rule falls on. */
export function nextOccurrence(rule: HolidayRule, from: DateStr): DateStr | null {
  const y = Number(from.slice(0, 4));
  for (const year of [y, y + 1]) {
    const d = holidayDate(rule, year);
    if (d && d >= from) return d;
  }
  return null;
}

/** Saved rules merged over the presets (presets keep their dates; custom rules added). */
export function mergeHolidays(stored: { rules?: HolidayRule[] } | null | undefined): HolidayRule[] {
  const saved = new Map((stored?.rules ?? []).map((r) => [r.key, r]));
  const presets = PRESET_HOLIDAYS.map((p) => ({ ...p, closed: saved.get(p.key)?.closed ?? p.closed }));
  const custom = (stored?.rules ?? []).filter((r) => r.custom && !PRESET_HOLIDAYS.some((p) => p.key === r.key));
  return [...presets, ...custom];
}

/** A one-time day off or blocked hours, salon-local. */
export interface DayOff {
  id: string;
  start: string; // ISO
  end: string; // ISO
  reason: string | null;
  allDay: boolean;
}

export interface Closure {
  kind: "holiday" | "day_off" | "blocked_hours";
  label: string;
}

/**
 * Why the salon is closed on a date (salon time), if it is. Partial-day
 * blocks are reported separately so the caller can decide per time slot.
 */
export function closureOn(date: DateStr, rules: HolidayRule[], daysOff: DayOff[], dayStart: Date, dayEnd: Date): Closure | null {
  const h = holidayOn(date, rules);
  if (h) return { kind: "holiday", label: h.name };
  const off = daysOff.find((o) => new Date(o.start) <= dayStart && new Date(o.end) >= dayEnd);
  if (off) return { kind: "day_off", label: off.reason || "Day off" };
  const part = daysOff.find((o) => new Date(o.start) < dayEnd && new Date(o.end) > dayStart);
  if (part) return { kind: "blocked_hours", label: part.reason || "Blocked time" };
  return null;
}

/** closureOn for a salon-local date in a time zone. */
export function closureForDate(date: DateStr, tz: string, rules: HolidayRule[], daysOff: DayOff[]): Closure | null {
  return closureOn(date, rules, daysOff, zonedToUtc(date, 0, tz), zonedToUtc(addDays(date, 1), 0, tz));
}

/** Whole day closed (holiday or full day off)? Partial blocks don't count. */
export function isClosedDay(date: DateStr, tz: string, rules: HolidayRule[], daysOff: DayOff[]): boolean {
  const c = closureForDate(date, tz, rules, daysOff);
  return !!c && c.kind !== "blocked_hours";
}

/** A blocked stretch (partial day off) that overlaps [start, end), if any. */
export function blockedDuring(start: Date, end: Date, daysOff: DayOff[]): DayOff | null {
  return daysOff.find((o) => new Date(o.start) < end && new Date(o.end) > start) ?? null;
}
