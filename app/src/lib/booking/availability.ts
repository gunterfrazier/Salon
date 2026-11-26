import { planAppointment, type MenuService } from "../schedule/plan";
import { addDays, parseHHMM, weekday, WEEKDAY_KEYS, zonedToUtc, type DateStr } from "../time/zone";

export interface BookingSettings {
  /** Earliest a client can book, from now. */
  minNoticeHours: number;
  /** How far ahead the calendar opens. */
  maxDaysAhead: number;
  /** Start times offered every N minutes. */
  stepMinutes: number;
}

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = { minNoticeHours: 12, maxDaysAhead: 60, stepMinutes: 15 };

export function bookingSettings(raw: unknown): BookingSettings {
  const r = (raw ?? {}) as Partial<Record<keyof BookingSettings, unknown>>;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : d);
  return {
    minNoticeHours: num(r.minNoticeHours, DEFAULT_BOOKING_SETTINGS.minNoticeHours, 0, 168),
    maxDaysAhead: num(r.maxDaysAhead, DEFAULT_BOOKING_SETTINGS.maxDaysAhead, 1, 365),
    stepMinutes: num(r.stepMinutes, DEFAULT_BOOKING_SETTINGS.stepMinutes, 5, 60),
  };
}

export type Hours = Partial<Record<(typeof WEEKDAY_KEYS)[number], [string, string] | null>>;
export interface Interval {
  start: Date;
  end: Date;
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export interface AvailabilityInput {
  date: DateStr;
  tz: string;
  hours: Hours;
  services: MenuService[];
  /** Stylist's busy time that day: other appointments' hands-on blocks and time off. */
  busy: Interval[];
  now: Date;
  settings: BookingSettings;
}

/** Start times (minutes after midnight, salon time) when the whole booking fits. */
export function availableStarts(i: AvailabilityInput): number[] {
  if (i.services.length === 0) return [];
  const h = i.hours[WEEKDAY_KEYS[weekday(i.date)]];
  if (!h) return [];
  const open = parseHHMM(h[0]);
  const close = parseHHMM(h[1]);
  const earliest = new Date(i.now.getTime() + i.settings.minNoticeHours * 3_600_000);
  const total = planAppointment(new Date(0), i.services).totalMinutes;

  const out: number[] = [];
  for (let m = open; m + total <= close; m += i.settings.stepMinutes) {
    const start = zonedToUtc(i.date, m, i.tz);
    if (start < earliest) continue;
    const plan = planAppointment(start, i.services);
    if (plan.busy.some((mine) => i.busy.some((b) => overlaps(mine, b)))) continue;
    out.push(m);
  }
  return out;
}

/** Days clients may pick: open days from tomorrow-ish up to maxDaysAhead. */
export function bookableDates(today: DateStr, hours: Hours, settings: BookingSettings): DateStr[] {
  const out: DateStr[] = [];
  for (let d = 0; d <= settings.maxDaysAhead; d++) {
    const date = addDays(today, d);
    if (hours[WEEKDAY_KEYS[weekday(date)]]) out.push(date);
  }
  return out;
}
