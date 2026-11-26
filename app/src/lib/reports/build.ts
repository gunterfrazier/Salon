import type { Hours } from "../context";
import { addDays, parseHHMM, wallParts, weekday, WEEKDAY_KEYS } from "../time/zone";

/** One appointment in the report range (by start time, salon time). */
export interface RAppt {
  id: string;
  clientId: string;
  start: Date;
  end: Date;
  status: string;
  bookedVia: "online" | "stylist";
  createdAt: Date;
  cancelledBy: "client" | "stylist" | null;
  cancelReason: string | null;
  lines: { name: string; category: string; cents: number }[];
  /** Hands-on minutes (processing time excluded). */
  busyMinutes: number;
}

export interface RPayment {
  kind: string;
  method: string;
  cents: number;
  at: Date;
  status: string;
}

export interface ReportInput {
  tz: string;
  /** First and last day, inclusive (YYYY-MM-DD, salon time). */
  from: string;
  to: string;
  hours: Hours;
  isClosed: (date: string) => boolean;
  appts: RAppt[];
  payments: RPayment[];
  /** Clients who had visits before this range (or imported with past visits): not "new". */
  returningClientIds: Set<string>;
  /** Appointments created on/after `from` (any date), to tell whether a visit was rebooked. */
  bookingsMade: { clientId: string; createdAt: Date; start: Date; status: string }[];
  /** Unpaid balances right now (not range-bound). */
  balancesOwed: number;
}

export interface Report {
  from: string;
  to: string;
  days: number;
  money: {
    collected: number;
    byKind: Record<string, number>;
    byMethod: { method: string; cents: number; count: number }[];
    serviceSales: number;
    tips: number;
    /** Paid with gift cards in the range (not in collected: counted when the card was sold). */
    giftCardsRedeemed: number;
    fees: number;
    deposits: number;
    refunds: number;
    avgTicket: number;
    tipPercent: number | null;
    balancesOwed: number;
  };
  appointments: {
    completed: number;
    upcoming: number;
    pending: number;
    noShows: number;
    cancelledByClient: number;
    cancelledByStylist: number;
    holdsReleased: number;
    online: number;
    byStylist: number;
    noShowRate: number | null;
    clientCancelRate: number | null;
  };
  clients: { served: number; new: number; returning: number; rebooked: number; rebookRate: number | null };
  services: { name: string; category: string; count: number; cents: number }[];
  categories: { category: string; count: number; cents: number }[];
  byWeekday: { day: number; visits: number; minutes: number }[];
  byHour: { hour: number; visits: number }[];
  utilization: number | null;
  daily: { date: string; collected: number; sales: number; visits: number }[];
}

const DONE = "completed";
const OPEN = new Set(["pending", "booked", "confirmed", "checked_in", "in_service"]);
export const HOLD_RELEASED = "Deposit not received; hold released";

const pct = (n: number, d: number) => (d > 0 ? n / d : null);

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function buildReport(i: ReportInput): Report {
  const tz = i.tz;
  const dayOf = (d: Date) => wallParts(d, tz).date;
  const dates = daysBetween(i.from, i.to);
  const daily = new Map(dates.map((d) => [d, { date: d, collected: 0, sales: 0, visits: 0 }]));

  // --- money (payments received in the range) ---
  const byKind: Record<string, number> = {};
  const methods = new Map<string, { method: string; cents: number; count: number }>();
  let collected = 0;
  // Paid from gift cards: the money came in when the card was sold, so it isn't counted again.
  let giftRedeemed = 0;
  let giftTips = 0;
  for (const p of i.payments) {
    if (p.status !== "succeeded") continue;
    if (p.method === "gift_card") {
      giftRedeemed += p.cents;
      if (p.kind === "tip") giftTips += p.cents;
      continue;
    }
    byKind[p.kind] = (byKind[p.kind] ?? 0) + p.cents;
    collected += p.cents;
    const row = daily.get(dayOf(p.at));
    if (row) row.collected += p.cents;
    if (p.kind !== "refund") {
      const m = methods.get(p.method) ?? { method: p.method, cents: 0, count: 0 };
      m.cents += p.cents;
      m.count++;
      methods.set(p.method, m);
    }
  }

  // --- appointments in the range ---
  const done = i.appts.filter((a) => a.status === DONE);
  const sales = done.reduce((n, a) => n + a.lines.reduce((m, l) => m + l.cents, 0), 0);
  for (const a of done) {
    const row = daily.get(dayOf(a.start));
    if (row) {
      row.sales += a.lines.reduce((m, l) => m + l.cents, 0);
      row.visits++;
    }
  }
  const noShows = i.appts.filter((a) => a.status === "no_show").length;
  const cancelled = i.appts.filter((a) => a.status === "cancelled");
  const holdsReleased = cancelled.filter((a) => a.cancelReason === HOLD_RELEASED).length;
  const cancelledByClient = cancelled.filter((a) => a.cancelledBy === "client" && a.cancelReason !== HOLD_RELEASED).length;
  const cancelledByStylist = cancelled.filter((a) => a.cancelledBy === "stylist").length;
  const confirmed = i.appts.filter((a) => a.cancelReason !== HOLD_RELEASED && a.status !== "pending");

  // --- clients ---
  const served = new Set(done.map((a) => a.clientId));
  const firstVisit = new Map<string, Date>();
  for (const a of done) if (!firstVisit.has(a.clientId) || a.start < firstVisit.get(a.clientId)!) firstVisit.set(a.clientId, a.start);
  const newClients = [...served].filter((c) => !i.returningClientIds.has(c)).length;
  // Rebooked: another appointment made within a day of the visit, for a later date.
  const rebooked = done.filter((v) =>
    i.bookingsMade.some(
      (b) => b.clientId === v.clientId && b.start > v.end && b.createdAt >= new Date(v.start.getTime() - 3_600_000) && b.createdAt <= new Date(v.end.getTime() + 86_400_000) && b.status !== "cancelled",
    ),
  ).length;

  // --- services ---
  const svc = new Map<string, { name: string; category: string; count: number; cents: number }>();
  const cat = new Map<string, { category: string; count: number; cents: number }>();
  for (const a of done)
    for (const l of a.lines) {
      const s = svc.get(l.name) ?? { name: l.name, category: l.category, count: 0, cents: 0 };
      s.count++;
      s.cents += l.cents;
      svc.set(l.name, s);
      const c = cat.get(l.category) ?? { category: l.category, count: 0, cents: 0 };
      c.count++;
      c.cents += l.cents;
      cat.set(l.category, c);
    }

  // --- busiest times (visits that happened or are booked) ---
  const busy = i.appts.filter((a) => a.status === DONE || OPEN.has(a.status));
  const byWeekday = Array.from({ length: 7 }, (_, day) => ({ day, visits: 0, minutes: 0 }));
  const byHour = new Map<number, number>();
  let bookedMinutes = 0;
  for (const a of busy) {
    const w = wallParts(a.start, tz);
    const d = byWeekday[weekday(w.date)];
    d.visits++;
    d.minutes += a.busyMinutes;
    bookedMinutes += a.busyMinutes;
    byHour.set(w.hour, (byHour.get(w.hour) ?? 0) + 1);
  }
  let openMinutes = 0;
  for (const d of dates) {
    const h = i.hours[WEEKDAY_KEYS[weekday(d)]];
    if (h && !i.isClosed(d)) openMinutes += parseHHMM(h[1]) - parseHHMM(h[0]);
  }

  const tips = (byKind.tip ?? 0) + giftTips;
  return {
    from: i.from,
    to: i.to,
    days: dates.length,
    money: {
      collected,
      byKind,
      byMethod: [...methods.values()].sort((a, b) => b.cents - a.cents),
      serviceSales: sales,
      tips,
      giftCardsRedeemed: giftRedeemed,
      fees: (byKind.cancel_fee ?? 0) + (byKind.no_show_fee ?? 0),
      deposits: byKind.deposit ?? 0,
      refunds: -(byKind.refund ?? 0),
      avgTicket: done.length ? Math.round(sales / done.length) : 0,
      tipPercent: sales > 0 && tips > 0 ? tips / sales : null,
      balancesOwed: i.balancesOwed,
    },
    appointments: {
      completed: done.length,
      upcoming: i.appts.filter((a) => OPEN.has(a.status) && a.status !== "pending").length,
      pending: i.appts.filter((a) => a.status === "pending").length,
      noShows,
      cancelledByClient,
      cancelledByStylist,
      holdsReleased,
      online: confirmed.filter((a) => a.bookedVia === "online").length,
      byStylist: confirmed.filter((a) => a.bookedVia === "stylist").length,
      noShowRate: pct(noShows, done.length + noShows),
      clientCancelRate: pct(cancelledByClient, confirmed.length),
    },
    clients: { served: served.size, new: newClients, returning: served.size - newClients, rebooked, rebookRate: pct(rebooked, done.length) },
    services: [...svc.values()].sort((a, b) => b.cents - a.cents || b.count - a.count),
    categories: [...cat.values()].sort((a, b) => b.cents - a.cents),
    byWeekday,
    byHour: [...byHour.entries()].map(([hour, visits]) => ({ hour, visits })).sort((a, b) => a.hour - b.hour),
    utilization: openMinutes > 0 ? bookedMinutes / openMinutes : null,
    daily: [...daily.values()],
  };
}

export type RangeKey = "today" | "week" | "month" | "last_month" | "quarter" | "year" | "last_year" | "custom";

/** Report ranges, in salon time. Weeks start Sunday. */
export function rangeFor(key: RangeKey, today: string, custom?: { from: string; to: string }): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const mm = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mo: number) => new Date(Date.UTC(yy, mo, 0)).getUTCDate();
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const from = addDays(today, -weekday(today));
      return { from, to: addDays(from, 6) };
    }
    case "month":
      return { from: `${y}-${mm(m)}-01`, to: `${y}-${mm(m)}-${lastDay(y, m)}` };
    case "last_month": {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return { from: `${py}-${mm(pm)}-01`, to: `${py}-${mm(pm)}-${lastDay(py, pm)}` };
    }
    case "quarter": {
      const q = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${mm(q)}-01`, to: `${y}-${mm(q + 2)}-${lastDay(y, q + 2)}` };
    }
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "custom":
      return custom && custom.from <= custom.to ? custom : { from: today, to: today };
  }
}

/** The same-length period just before a range, for comparisons. */
export function previousRange(r: { from: string; to: string }): { from: string; to: string } {
  const n = daysBetween(r.from, r.to).length;
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

/** Change vs the previous period, or null when there's nothing to compare. */
export function change(now: number, before: number): number | null {
  return before > 0 ? (now - before) / before : null;
}

/** CSV with a header row; quotes fields that need it. */
export function toCsv(rows: (string | number | null)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null ? "" : String(v);
          const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s; // no spreadsheet formulas
          return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(","),
    )
    .join("\r\n");
}
