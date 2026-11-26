import { describe, expect, it } from "vitest";
import { describeWindow, entryCriteria, isFulfilled, matchingOpenings, offerFor, type WaitEntry } from "./match";

const base: WaitEntry = {
  id: "w1",
  clientId: "c1",
  staffId: null,
  serviceIds: ["color"],
  weekdays: [5], // Fridays
  timeFrom: 9 * 60,
  timeTo: 12 * 60,
  dateFrom: "2026-12-01",
  dateTo: "2026-12-31",
  lastOfferedAt: null,
  lastOfferedSlots: [],
  createdAt: new Date("2026-11-26T15:00:00Z"),
};
const now = new Date("2026-11-27T15:00:00Z");

describe("waitlist matching", () => {
  it("keeps openings on the right days, times and dates, earliest first", () => {
    const got = matchingOpenings(base, [
      { date: "2026-12-11", minutes: 600 },
      { date: "2026-12-04", minutes: 660 }, // Fri 11:00 ✓
      { date: "2026-12-04", minutes: 720 }, // noon: outside
      { date: "2026-12-05", minutes: 600 }, // Saturday
      { date: "2027-01-01", minutes: 600 }, // after the range
    ]);
    expect(got).toEqual([{ date: "2026-12-04", minutes: 660 }, { date: "2026-12-11", minutes: 600 }]);
  });

  it("searches from the later of today and the first date, with the time window", () => {
    expect(entryCriteria(base, "2026-11-27")).toEqual({ weekdays: [5], block: { from: 540, to: 720 }, start: { kind: "date", date: "2026-12-01" } });
    expect(entryCriteria({ ...base, timeFrom: 0, timeTo: 1440 }, "2026-12-10").start).toEqual({ kind: "date", date: "2026-12-10" });
    expect(entryCriteria({ ...base, timeFrom: 0, timeTo: 1440 }, "2026-12-10").block).toBe("any");
  });

  it("offers up to three openings", () => {
    const open = ["2026-12-04", "2026-12-11", "2026-12-18", "2026-12-25"].map((date) => ({ date, minutes: 600 }));
    expect(offerFor(base, open, now)).toHaveLength(3);
    expect(offerFor(base, [], now)).toBeNull();
  });

  it("waits a day between offers and doesn't repeat the same times", () => {
    const open = [{ date: "2026-12-04", minutes: 600 }];
    expect(offerFor({ ...base, lastOfferedAt: new Date(now.getTime() - 3_600_000) }, [{ date: "2026-12-11", minutes: 600 }], now)).toBeNull();
    expect(offerFor({ ...base, lastOfferedAt: new Date(now.getTime() - 30 * 3_600_000), lastOfferedSlots: ["2026-12-04 600"] }, open, now)).toBeNull();
    expect(offerFor({ ...base, lastOfferedAt: new Date(now.getTime() - 30 * 3_600_000), lastOfferedSlots: ["2026-12-04 600"] }, [...open, { date: "2026-12-11", minutes: 540 }], now)).toHaveLength(2);
  });

  it("is fulfilled by a later booking of one of its services in range", () => {
    const appt = { clientId: "c1", date: "2026-12-04", serviceIds: ["color", "cut"], createdAt: new Date("2026-11-28T00:00:00Z") };
    expect(isFulfilled(base, [appt])).toBe(true);
    expect(isFulfilled(base, [{ ...appt, clientId: "c2" }])).toBe(false);
    expect(isFulfilled(base, [{ ...appt, serviceIds: ["cut"] }])).toBe(false);
    expect(isFulfilled(base, [{ ...appt, date: "2027-01-04" }])).toBe(false);
    expect(isFulfilled(base, [{ ...appt, createdAt: new Date("2026-11-20T00:00:00Z") }])).toBe(false);
  });

  it("describes the window", () => {
    expect(describeWindow(base)).toBe("Fri · 9 AM–12 PM · Dec 1 – Dec 31");
    expect(describeWindow({ ...base, weekdays: [], timeFrom: 0, timeTo: 1440 })).toBe("Any day · any time · Dec 1 – Dec 31");
    expect(describeWindow({ ...base, timeFrom: 1020, timeTo: 1440 })).toBe("Fri · evenings · Dec 1 – Dec 31");
    expect(describeWindow({ ...base, timeFrom: 960, timeTo: 1440 })).toBe("Fri · after 4 PM · Dec 1 – Dec 31");
  });
});
