import { addDays, parseHHMM, wallParts, zonedToUtc } from "../time/zone";
import { reminderMinutes, type Channel, type NotificationSettings, type TemplateKey } from "./settings";

/** Minimal appointment shape the scheduler needs. */
export interface NotifyAppt {
  id: string;
  clientId: string;
  start: Date;
  status: string;
  createdAt: Date;
  depositDue: number;
}

export interface Planned {
  /** Unique per message; a sent key is never sent again. Includes the start time, so a moved appointment gets fresh reminders. */
  key: string;
  apptId: string;
  clientId: string;
  template: TemplateKey;
  channels: Channel[];
  sendAt: Date;
}

const UPCOMING = new Set(["booked", "confirmed"]);
const MIN = 60_000;

/** Minutes after local midnight for a UTC instant. */
const wallMinutes = (d: Date, tz: string) => {
  const p = wallParts(d, tz);
  return p.hour * 60 + p.minute;
};

function inQuiet(d: Date, tz: string, q: NotificationSettings["quietHours"]): boolean {
  if (!q) return false;
  const m = wallMinutes(d, tz);
  const s = parseHHMM(q.start);
  const e = parseHHMM(q.end);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

/**
 * Moves a scheduled (not urgent) message out of quiet hours by sending it
 * EARLIER, just before quiet hours begin, so it still arrives ahead of time.
 */
export function beforeQuiet(d: Date, tz: string, q: NotificationSettings["quietHours"]): Date {
  if (!q || !inQuiet(d, tz, q)) return d;
  const { date } = wallParts(d, tz);
  const s = parseHHMM(q.start);
  // The quiet window that contains d started today (if we're past start) or yesterday.
  const startDay = wallMinutes(d, tz) >= s ? date : addDays(date, -1);
  return new Date(zonedToUtc(startDay, s, tz).getTime() - 5 * MIN);
}

/** Moves an event message (e.g. a cancel notice sent at 11 PM) LATER, to when quiet hours end. */
export function afterQuiet(d: Date, tz: string, q: NotificationSettings["quietHours"]): Date {
  if (!q || !inQuiet(d, tz, q)) return d;
  const { date } = wallParts(d, tz);
  const e = parseHHMM(q.end);
  const endDay = wallMinutes(d, tz) < e ? date : addDays(date, 1);
  return zonedToUtc(endDay, e, tz);
}

/** The client reminders for one appointment, with quiet hours applied. */
export function plannedReminders(a: NotifyAppt, s: NotificationSettings, tz: string): Planned[] {
  if (!UPCOMING.has(a.status)) return [];
  const out: Planned[] = [];
  for (const r of s.client.reminders) {
    if (!r.enabled || r.channels.length === 0) continue;
    const ideal = new Date(a.start.getTime() - reminderMinutes(r) * MIN);
    const sendAt = beforeQuiet(ideal, tz, s.quietHours);
    // Booked after this reminder would have gone out: the confirmation covers it.
    if (sendAt.getTime() < a.createdAt.getTime() + 30 * MIN) continue;
    out.push({ key: `reminder:${a.id}:${r.id}:${a.start.toISOString()}`, apptId: a.id, clientId: a.clientId, template: "reminder", channels: r.channels, sendAt });
  }
  return out;
}

/** Reminders due right now that haven't been sent. Missed ones are still sent as long as the appointment hasn't started. */
export function dueReminders(appts: NotifyAppt[], sentKeys: Set<string>, s: NotificationSettings, tz: string, now: Date): Planned[] {
  return appts
    .filter((a) => a.start.getTime() > now.getTime())
    .flatMap((a) => plannedReminders(a, s, tz))
    .filter((p) => p.sendAt.getTime() <= now.getTime())
    // Once a later reminder is due (sent or not), earlier ones are stale: after an outage only the latest goes out.
    .filter((p, _, all) => !all.some((o) => o.apptId === p.apptId && o.sendAt.getTime() > p.sendAt.getTime()))
    .filter((p) => !sentKeys.has(p.key));
}

export type HoldAction = { kind: "remind"; key: string; appt: NotifyAppt } | { kind: "release"; key: string; appt: NotifyAppt };

/**
 * Online bookings waiting on a deposit ("pending"): remind once, then release
 * the time. A hold is always released at least an hour before the start.
 */
export function holdActions(pending: NotifyAppt[], sentKeys: Set<string>, s: NotificationSettings, now: Date): HoldAction[] {
  const out: HoldAction[] = [];
  const t = now.getTime();
  for (const a of pending) {
    if (a.status !== "pending" || a.depositDue <= 0) continue;
    const releaseAt = Math.min(a.createdAt.getTime() + s.depositHold.releaseAfterHours * 60 * MIN, a.start.getTime() - 60 * MIN);
    const remindAt = a.createdAt.getTime() + s.depositHold.remindAfterHours * 60 * MIN;
    if (t >= releaseAt) out.push({ kind: "release", key: `hold-release:${a.id}`, appt: a });
    else if (s.depositHold.remindAfterHours > 0 && t >= remindAt && !sentKeys.has(`hold-remind:${a.id}`)) out.push({ kind: "remind", key: `hold-remind:${a.id}`, appt: a });
  }
  return out;
}

/** Whether the stylist's day preview should go out now; returns the day it covers, or null. */
export function dayPreviewDue(s: NotificationSettings, tz: string, now: Date, lastSentFor: string | null): string | null {
  const p = s.stylist.dayPreview;
  if (!p.enabled) return null;
  const { date } = wallParts(now, tz);
  if (wallMinutes(now, tz) < parseHHMM(p.at)) return null;
  const forDay = p.day === "tomorrow" ? addDays(date, 1) : date;
  return lastSentFor === forDay ? null : forDay;
}

/** Fills {placeholders}; unknown or empty ones are dropped along with a dangling separator. */
export function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = vars[k];
      return v === null || v === undefined ? "" : String(v);
    })
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/:\s*$/, ".")
    .trim();
}

export const PLACEHOLDERS: Record<string, string> = {
  first_name: "Client's first name",
  salon: "Salon name",
  services: "Services booked",
  date: "Appointment day (e.g. Tue, Dec 1)",
  time: "Start time with time zone (e.g. 10:30 AM CST)",
  deposit: "Deposit amount",
  pay_link: "Where to pay the deposit",
  hold_hours: "Hours before an unpaid hold is released",
  total: "Receipt total",
  details: "Receipt lines: services, tip, paid",
  manage_link: "Link to change or cancel",
  book_link: "Online booking link",
  review_link: "Review page link",
  weeks: "Weeks since last visit",
  openings: "Waitlist: the open times (e.g. Fri, Dec 4 at 10 AM)",
  waitlist_link: "Waitlist: link to book the first open time",
};

/** SMS segments (160 GSM-7 chars, or 70 if it has emoji/special characters), to keep texts short and cheap. */
export function smsSegments(text: string): number {
  const gsm = /^[\x0A\x0D\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]*$/.test(text);
  const per = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return text.length <= per ? 1 : Math.ceil(text.length / multi);
}
