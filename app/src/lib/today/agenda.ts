import type { CalAppointment, CalendarData } from "../data/calendar-types";
import { reviveClientState } from "../data/clients-shared";
import type { Hours } from "../context";
import { parseHHMM, WEEKDAY_KEYS, weekday, zonedToUtc } from "../time/zone";
import type { StatusKey } from "../ui/status-colors";
import { clientChips, NEW_CLIENT_STATE } from "../ui/standing";

/** Statuses that still need the stylist's attention today. */
const OPEN = new Set(["pending", "booked", "confirmed", "checked_in", "in_service"]);

export interface AgendaItem {
  appt: CalAppointment;
  /** "now" while it is running, "done" once it has ended or been closed out. */
  when: "upcoming" | "now" | "done";
  total: number;
  depositDue: number;
  chips: { status: StatusKey; text?: string }[];
  /** First visit ever. */
  isNew: boolean;
}

export interface AgendaGap {
  start: Date;
  end: Date;
  minutes: number;
}

export interface Agenda {
  date: string;
  closed: boolean;
  open: Date | null;
  close: Date | null;
  items: AgendaItem[];
  /** Open stretches of 30+ minutes inside business hours, between and around appointments. */
  gaps: AgendaGap[];
  summary: {
    count: number;
    /** Sum of quoted prices for appointments that aren't cancelled or no-shows. */
    expected: number;
    depositsDue: number;
    newClients: number;
    flagged: number;
    /** Hands-on + processing time booked, in minutes. */
    bookedMinutes: number;
  };
}

const MIN_GAP = 30;

export function hoursOn(date: string, hours: Hours, tz: string): { open: Date; close: Date } | null {
  const w = hours[WEEKDAY_KEYS[weekday(date)]];
  if (!w) return null;
  return { open: zonedToUtc(date, parseHHMM(w[0]), tz), close: zonedToUtc(date, parseHHMM(w[1]), tz) };
}

/** `showGaps`: open time only makes sense for one person's day. */
export function buildAgenda(data: Pick<CalendarData, "appointments" | "clientStates" | "policy" | "hours" | "timezone">, date: string, now: Date, closed = false, showGaps = true): Agenda {
  const tz = data.timezone;
  const window = closed ? null : hoursOn(date, data.hours, tz);
  const dayStart = zonedToUtc(date, 0, tz).getTime();
  const dayEnd = zonedToUtc(date, 24 * 60, tz).getTime();

  const appts = data.appointments
    .filter((a) => a.status !== "cancelled")
    .filter((a) => new Date(a.start).getTime() < dayEnd && new Date(a.end).getTime() > dayStart)
    .sort((x, y) => x.start.localeCompare(y.start));

  const items: AgendaItem[] = appts.map((a) => {
    const st = data.clientStates[a.clientId];
    const state = st ? reviveClientState(st) : NEW_CLIENT_STATE;
    const { chips } = clientChips(state, data.policy, now);
    const depositDue = OPEN.has(a.status) ? Math.max(0, a.depositRequired - a.depositPaid) : 0;
    if (a.depositRequired > 0) chips.push(depositDue > 0 ? { status: "card_needed", text: `Deposit $${(depositDue / 100).toFixed(2)} due` } : { status: "deposit_paid" });
    const s = new Date(a.start).getTime();
    const e = new Date(a.end).getTime();
    const when = !OPEN.has(a.status) || e <= now.getTime() ? "done" : s <= now.getTime() ? "now" : "upcoming";
    return {
      appt: a,
      when,
      total: a.services.reduce((n, l) => n + l.finalPrice, 0),
      depositDue,
      chips,
      isNew: state.onTimeVisits.length + state.priorVisitCount === 0,
    };
  });

  // Open time: business hours minus hands-on blocks (processing time counts as open).
  const gaps: AgendaGap[] = [];
  if (window && showGaps) {
    const busy = appts
      .filter((a) => OPEN.has(a.status) || a.status === "completed")
      .flatMap((a) => (a.busy.length ? a.busy : [{ start: a.start, end: a.end }]))
      .map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const)
      .sort((x, y) => x[0] - y[0]);
    let cursor = window.open.getTime();
    const push = (s: number, e: number) => {
      const minutes = Math.round((e - s) / 60000);
      if (minutes >= MIN_GAP) gaps.push({ start: new Date(s), end: new Date(e), minutes });
    };
    for (const [s, e] of busy) {
      if (s > cursor) push(cursor, Math.min(s, window.close.getTime()));
      cursor = Math.max(cursor, e);
      if (cursor >= window.close.getTime()) break;
    }
    if (cursor < window.close.getTime()) push(cursor, window.close.getTime());
  }

  const counted = items.filter((i) => i.appt.status !== "no_show");
  return {
    date,
    closed: !window,
    open: window?.open ?? null,
    close: window?.close ?? null,
    items,
    gaps,
    summary: {
      count: counted.length,
      expected: counted.reduce((n, i) => n + i.total, 0),
      depositsDue: items.reduce((n, i) => n + i.depositDue, 0),
      newClients: counted.filter((i) => i.isNew).length,
      flagged: counted.filter((i) => i.chips.some((c) => c.status === "permanent_flag" || c.status === "no_show" || c.status === "late_cancel")).length,
      bookedMinutes: counted.reduce((n, i) => n + Math.round((new Date(i.appt.end).getTime() - new Date(i.appt.start).getTime()) / 60000), 0),
    },
  };
}
