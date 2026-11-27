/** Checks a stylist can override after a warning: working outside their hours, and double-booking. */
import { planAppointment, type MenuService } from "../schedule/plan";
import { addDays, parseHHMM, weekday, WEEKDAY_KEYS, zonedToUtc, type DateStr } from "../time/zone";
import type { Hours, Interval } from "./availability";

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Why [start, start+minutes) falls outside the stylist's hours on that date, or null. */
export function outsideHours(date: DateStr, startMin: number, minutes: number, hours: Hours): string | null {
  const h = hours[WEEKDAY_KEYS[weekday(date)]];
  if (!h) return "not a working day";
  const open = parseHHMM(h[0]);
  const close = parseHHMM(h[1]);
  if (startMin < open) return "starts before opening";
  if (startMin + minutes > close) return "runs past closing";
  return null;
}

/** Hands-on blocks of a planned booking that collide with existing busy time. */
export function collisions(mine: Interval[], busy: Interval[]): Interval[] {
  return busy.filter((b) => mine.some((m) => overlaps(m, b)));
}

export interface OpenTimesInput {
  date: DateStr;
  tz: string;
  hours: Hours;
  /** Chosen services; none yet = any free 30 minutes. */
  services: MenuService[];
  busy: Interval[];
  now: Date;
  stepMinutes: number;
}

/**
 * Start times (minutes after midnight, salon time), soonest first, when the
 * booking fits inside working hours without touching anyone's hands-on time.
 * With no services chosen yet, any open half hour counts.
 */
export function openTimes(i: OpenTimesInput): number[] {
  const h = i.hours[WEEKDAY_KEYS[weekday(i.date)]];
  if (!h) return [];
  const open = parseHHMM(h[0]);
  const close = parseHHMM(h[1]);
  const dayEnd = zonedToUtc(addDays(i.date, 1), 0, i.tz);
  if (dayEnd <= i.now) return [];
  const out: number[] = [];
  const total = i.services.length ? planAppointment(new Date(0), i.services).totalMinutes : 30;
  const step = Math.max(5, i.stepMinutes);
  for (let m = open; m + total <= close; m += step) {
    const start = zonedToUtc(i.date, m, i.tz);
    if (start < i.now) continue;
    const mine = i.services.length ? planAppointment(start, i.services).busy : [{ start, end: new Date(start.getTime() + total * 60_000) }];
    if (collisions(mine, i.busy).length) continue;
    out.push(m);
  }
  return out;
}
