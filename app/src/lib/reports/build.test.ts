import { describe, expect, it } from "vitest";
import { buildReport, change, HOLD_RELEASED, previousRange, rangeFor, toCsv, type RAppt } from "./build";

const TZ = "America/Chicago";
const ct = (s: string) => new Date(`${s}-06:00`);
const hours = { tue: ["09:00", "17:00"] as [string, string], wed: ["09:00", "17:00"] as [string, string] };

function appt(id: string, client: string, start: string, mins: number, status: string, extra: Partial<RAppt> = {}): RAppt {
  return {
    id, clientId: client, start: ct(start), end: new Date(ct(start).getTime() + mins * 60000), status, bookedVia: "stylist",
    createdAt: ct("2026-11-20T10:00"), cancelledBy: null, cancelReason: null,
    lines: [{ name: "Women's Cut", category: "Cut & Style", cents: 5500 }], busyMinutes: mins, ...extra,
  };
}

describe("buildReport", () => {
  const color = { name: "All Over Color", category: "Color Services", cents: 9500 };
  const input = {
    tz: TZ, from: "2026-12-01", to: "2026-12-02", hours, isClosed: () => false,
    appts: [
      appt("a", "c1", "2026-12-01T09:00", 60, "completed"),
      appt("b", "c2", "2026-12-01T10:30", 120, "completed", { lines: [color, { name: "Style", category: "Cut & Style", cents: 3500 }], busyMinutes: 75, bookedVia: "online" }),
      appt("c", "c3", "2026-12-02T09:00", 60, "no_show"),
      appt("d", "c4", "2026-12-02T11:00", 60, "cancelled", { cancelledBy: "client" }),
      appt("e", "c5", "2026-12-02T13:00", 60, "cancelled", { cancelledBy: "client", cancelReason: HOLD_RELEASED, bookedVia: "online" }),
      appt("f", "c6", "2026-12-02T15:00", 60, "booked"),
    ],
    payments: [
      { kind: "service", method: "venmo_direct", cents: 5500, at: ct("2026-12-01T10:00"), status: "succeeded" },
      { kind: "tip", method: "venmo_direct", cents: 1100, at: ct("2026-12-01T10:00"), status: "succeeded" },
      { kind: "deposit", method: "zelle", cents: 5000, at: ct("2026-11-28T12:00"), status: "succeeded" }, // outside range days, still counted as received
      { kind: "service", method: "cash", cents: 8000, at: ct("2026-12-01T12:30"), status: "succeeded" },
      { kind: "no_show_fee", method: "cash", cents: 5500, at: ct("2026-12-02T10:00"), status: "succeeded" },
      { kind: "refund", method: "other", cents: -1000, at: ct("2026-12-02T10:00"), status: "succeeded" },
      { kind: "service", method: "cash", cents: 999, at: ct("2026-12-02T10:00"), status: "pending" },
    ],
    returningClientIds: new Set(["c1"]),
    bookingsMade: [{ clientId: "c2", createdAt: ct("2026-12-01T12:25"), start: ct("2027-01-12T10:30"), status: "booked" }],
    balancesOwed: 2500,
  };
  const r = buildReport(input);

  it("totals money received by kind and method", () => {
    expect(r.money.collected).toBe(5500 + 1100 + 5000 + 8000 + 5500 - 1000);
    expect(r.money).toMatchObject({ tips: 1100, fees: 5500, deposits: 5000, refunds: 1000, serviceSales: 5500 + 13000, avgTicket: 9250, balancesOwed: 2500 });
    expect(r.money.tipPercent).toBeCloseTo(1100 / 18500);
    expect(r.money.byMethod.map((m) => [m.method, m.cents, m.count])).toEqual([["cash", 13500, 2], ["venmo_direct", 6600, 2], ["zelle", 5000, 1]]);
  });

  it("counts gift card sales as money in, and gift card spending only once", () => {
    const g = buildReport({
      ...input,
      payments: [
        { kind: "gift_card", method: "cash", cents: 5000, at: ct("2026-12-01T10:00"), status: "succeeded" },
        { kind: "service", method: "gift_card", cents: 4000, at: ct("2026-12-02T10:00"), status: "succeeded" },
        { kind: "tip", method: "gift_card", cents: 500, at: ct("2026-12-02T10:00"), status: "succeeded" },
      ],
    });
    expect(g.money.collected).toBe(5000);
    expect(g.money.byKind).toEqual({ gift_card: 5000 });
    expect(g.money.byMethod.map((m) => m.method)).toEqual(["cash"]);
    expect(g.money.giftCardsRedeemed).toBe(4500);
    expect(g.money.tips).toBe(500);
  });

  it("counts visits, no-shows, cancellations and released holds separately", () => {
    expect(r.appointments).toMatchObject({ completed: 2, upcoming: 1, noShows: 1, cancelledByClient: 1, holdsReleased: 1, online: 1, byStylist: 4 });
    expect(r.appointments.noShowRate).toBeCloseTo(1 / 3);
    expect(r.appointments.clientCancelRate).toBeCloseTo(1 / 5);
  });

  it("finds new clients and rebooking", () => {
    expect(r.clients).toMatchObject({ served: 2, new: 1, returning: 1, rebooked: 1 });
    expect(r.clients.rebookRate).toBe(0.5);
  });

  it("ranks services and finds busy times", () => {
    expect(r.services[0]).toEqual({ name: "All Over Color", category: "Color Services", count: 1, cents: 9500 });
    expect(r.categories.map((c) => [c.category, c.count])).toEqual([["Color Services", 1], ["Cut & Style", 2]]);
    expect(r.byWeekday[2]).toEqual({ day: 2, visits: 2, minutes: 135 });
    expect(r.byHour).toEqual([{ hour: 9, visits: 1 }, { hour: 10, visits: 1 }, { hour: 15, visits: 1 }]);
    expect(r.utilization).toBeCloseTo((60 + 75 + 60) / (2 * 480));
    expect(r.daily).toEqual([
      { date: "2026-12-01", collected: 14600, sales: 18500, visits: 2 },
      { date: "2026-12-02", collected: 4500, sales: 0, visits: 0 },
    ]);
  });
});

describe("ranges and helpers", () => {
  it("builds ranges in salon days", () => {
    expect(rangeFor("week", "2026-11-26")).toEqual({ from: "2026-11-22", to: "2026-11-28" });
    expect(rangeFor("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(rangeFor("last_month", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(rangeFor("quarter", "2026-11-26")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(previousRange({ from: "2026-11-01", to: "2026-11-30" })).toEqual({ from: "2026-10-02", to: "2026-10-31" });
    expect(change(150, 100)).toBe(0.5);
    expect(change(5, 0)).toBeNull();
  });

  it("writes safe CSV", () => {
    expect(toCsv([["Name", "Note", "Amount"], ['Ana "A"', "=HYPERLINK(x)", -5], ["B, C", null, 12.5]])).toBe('Name,Note,Amount\r\n"Ana ""A""",\'=HYPERLINK(x),-5\r\n"B, C",,12.5');
  });
});
