import type { Hours } from "../context";
import { parseHHMM, weekday, WEEKDAY_KEYS, zonedToUtc } from "../time/zone";

export interface Span {
  start: Date;
  end: Date;
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;
const same = (a: Span, b: Span) => a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();

/**
 * Start times (minutes after midnight, salon time) an existing appointment can
 * move to on `date`: the whole appointment fits in business hours, it isn't in
 * the past, and its hands-on blocks don't overlap anyone else's (its own
 * processing gaps stay open, as when booking).
 */
export function moveStarts(i: { date: string; tz: string; hours: Hours; appt: { start: Date; end: Date; busy: Span[] }; busy: Span[]; now: Date; stepMinutes?: number }): number[] {
  const h = i.hours[WEEKDAY_KEYS[weekday(i.date)]];
  if (!h) return [];
  const step = i.stepMinutes ?? 15;
  const open = parseHHMM(h[0]);
  const close = parseHHMM(h[1]);
  const length = Math.round((i.appt.end.getTime() - i.appt.start.getTime()) / 60_000);
  const offsets = (i.appt.busy.length ? i.appt.busy : [{ start: i.appt.start, end: i.appt.end }]).map((b) => [b.start.getTime() - i.appt.start.getTime(), b.end.getTime() - i.appt.start.getTime()] as const);
  // Everyone else's busy time: drop this appointment's own blocks.
  const others = i.busy.filter((b) => !i.appt.busy.some((mine) => same(mine, b)));

  const out: number[] = [];
  for (let m = open; m + length <= close; m += step) {
    const start = zonedToUtc(i.date, m, i.tz);
    if (start < i.now) continue;
    const blocks = offsets.map(([s, e]) => ({ start: new Date(start.getTime() + s), end: new Date(start.getTime() + e) }));
    if (blocks.some((b) => others.some((o) => overlaps(b, o)))) continue;
    out.push(m);
  }
  return out;
}
