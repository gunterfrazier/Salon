/** Wording and summaries for screens: open/closed sign, the week's hours, next appointment, open days. */
import type { Hours } from "../booking/availability";
import { publicName } from "../display/board";
import { addDays, formatDay, formatMinutes, formatTime, parseHHMM, wallParts, weekday, WEEKDAY_KEYS, type DateStr } from "../time/zone";

const hoursOn = (date: DateStr, hours: Hours) => {
  const h = hours[WEEKDAY_KEYS[weekday(date)]];
  return h ? { open: parseHHMM(h[0]), close: parseHHMM(h[1]) } : null;
};

/** Why a day is closed (holiday name, "Closed"), or null if open. */
export type ClosedOn = (date: DateStr) => string | null;

export interface OpenStatus {
  open: boolean;
  /** "Open until 7:00 PM", "Opens today at 3:30 PM", "Closed · Opens Thursday at 3:30 PM" */
  line: string;
  /** Holiday or closure name for today, if any. */
  reason: string | null;
}

/** The front-window sign: are we open right now, and if not, when do we open? */
export function openStatus(now: Date, tz: string, hours: Hours, closedOn: ClosedOn): OpenStatus {
  const { date, minutes } = (() => {
    const p = wallParts(now, tz);
    return { date: p.date, minutes: p.hour * 60 + p.minute };
  })();
  const reason = closedOn(date);
  const h = reason ? null : hoursOn(date, hours);
  if (h && minutes >= h.open && minutes < h.close) return { open: true, line: `Open until ${formatMinutes(h.close)}`, reason: null };
  if (h && minutes < h.open) return { open: false, line: `Opens today at ${formatMinutes(h.open)}`, reason: null };
  for (let i = 1; i <= 21; i++) {
    const d = addDays(date, i);
    if (closedOn(d)) continue;
    const n = hoursOn(d, hours);
    if (!n) continue;
    const day = i === 1 ? "tomorrow" : formatDay(d, { weekday: "long" });
    return { open: false, line: `Closed · Opens ${day} at ${formatMinutes(n.open)}`, reason };
  }
  return { open: false, line: "Closed", reason };
}

export interface DayHours {
  date: DateStr;
  /** "Today", "Tomorrow", "Thursday" */
  label: string;
  /** "3:30 – 7:00 PM", "Closed", "Closed · Christmas" */
  text: string;
  closed: boolean;
}

const range = (open: number, close: number) => {
  const a = formatMinutes(open);
  const b = formatMinutes(close);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
};

/** The next seven days' hours, starting today, with holidays and closures named. */
export function weekHours(today: DateStr, hours: Hours, closedOn: ClosedOn): DayHours[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDay(date, { weekday: "long" });
    const why = closedOn(date);
    const h = hoursOn(date, hours);
    if (why) return { date, label, text: why === "Closed" ? "Closed" : `Closed · ${why}`, closed: true };
    if (!h) return { date, label, text: "Closed", closed: true };
    return { date, label, text: range(h.open, h.close), closed: false };
  });
}

export interface UpcomingAppt {
  start: string;
  clientName: string;
  services: string[];
  stylist?: string;
}

/**
 * When nothing is left today: "No appointments today. Your next appointment is
 * tomorrow, Saturday, Nov 28 at 7:15 AM: Gunter F., Women's Cut."
 */
export function nextAppointmentLine(next: UpcomingAppt | null, today: DateStr, tz: string, opts: { anyToday: boolean; fullName?: boolean }): string {
  const lead = opts.anyToday ? "No more appointments today." : "No appointments today.";
  if (!next) return `${lead} Nothing else is booked yet.`;
  const at = new Date(next.start);
  const d = wallParts(at, tz).date;
  const day = d === addDays(today, 1) ? `tomorrow, ${formatDay(d, { weekday: "long", month: "short", day: "numeric" })}` : formatDay(d, { weekday: "long", month: "short", day: "numeric" });
  const who = opts.fullName ? next.clientName : publicName(next.clientName);
  const svc = next.services.length ? `, ${next.services.join(" + ")}` : "";
  const by = next.stylist ? ` with ${next.stylist}` : "";
  return `${lead} The next appointment is ${day} at ${formatTime(at, tz).replace(/\s[A-Z]{2,5}$/, "")}: ${who}${svc}${by}.`;
}

export type DayLoad = "closed" | "open" | "busy" | "full";

/** How full a day is: open = plenty of room, busy = under 2 hours free, full = under 30 minutes. */
export function dayLoad(openMinutes: number, bookedMinutes: number, closed: boolean): DayLoad {
  if (closed || openMinutes <= 0) return "closed";
  const free = Math.max(0, openMinutes - bookedMinutes);
  if (free < 30) return "full";
  if (free < 120) return "busy";
  return "open";
}

/** Working minutes on a date from the hours (0 when closed that weekday). */
export function workingMinutes(date: DateStr, hours: Hours): number {
  const h = hoursOn(date, hours);
  return h ? h.close - h.open : 0;
}

/** Runs of 15-minute open starts → windows ("3:30 PM, 90 minutes free"). */
export function windows(starts: number[], step = 15, slot = 30): { start: number; minutes: number }[] {
  const out: { start: number; minutes: number }[] = [];
  for (const m of starts) {
    const lastW = out[out.length - 1];
    if (lastW && m === lastW.start + lastW.minutes - slot + step) lastW.minutes += step;
    else out.push({ start: m, minutes: slot });
  }
  return out;
}
