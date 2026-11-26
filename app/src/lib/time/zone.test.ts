import { describe, expect, it } from "vitest";
import { addDays, formatDateTime, formatMinutes, formatSlot, formatTime, formatTimeRange, parseHHMM, startOfWeek, todayIn, tzAbbrev, wallParts, weekday, zoneLabel, zonedToUtc } from "./zone";

const TZ = "America/Chicago";

describe("zonedToUtc", () => {
  it("winter (CST, UTC-6)", () => {
    expect(zonedToUtc("2026-12-01", parseHHMM("15:30"), TZ).toISOString()).toBe("2026-12-01T21:30:00.000Z");
  });
  it("summer (CDT, UTC-5)", () => {
    expect(zonedToUtc("2026-07-10", parseHHMM("09:00"), TZ).toISOString()).toBe("2026-07-10T14:00:00.000Z");
  });
  it("midnight and late evening map to the right UTC day", () => {
    expect(zonedToUtc("2026-12-01", 0, TZ).toISOString()).toBe("2026-12-01T06:00:00.000Z");
    expect(zonedToUtc("2026-12-01", parseHHMM("20:30"), TZ).toISOString()).toBe("2026-12-02T02:30:00.000Z");
  });
  it("spring-forward gap moves to the next valid time", () => {
    // 2027-03-14 02:30 doesn't exist in Chicago; 03:30 CDT = 08:30Z.
    const d = zonedToUtc("2027-03-14", parseHHMM("02:30"), TZ);
    expect(d.toISOString()).toBe("2027-03-14T08:30:00.000Z");
    expect(wallParts(d, TZ).minutes).toBe(parseHHMM("03:30"));
  });
  it("fall-back overlap uses the first 1:30", () => {
    // 2026-11-01 01:30 happens twice; first is CDT (06:30Z).
    expect(zonedToUtc("2026-11-01", parseHHMM("01:30"), TZ).toISOString()).toBe("2026-11-01T06:30:00.000Z");
  });
  it("round-trips through wallParts", () => {
    for (const [date, t] of [["2026-03-08", "10:15"], ["2026-11-01", "18:45"], ["2026-12-31", "23:59"]] as const) {
      const w = wallParts(zonedToUtc(date, parseHHMM(t), TZ), TZ);
      expect([w.date, w.minutes]).toEqual([date, parseHHMM(t)]);
    }
  });
});

describe("date helpers", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("weekday and week start (Sunday)", () => {
    expect(weekday("2026-11-25")).toBe(3); // Wednesday
    expect(startOfWeek("2026-11-25")).toBe("2026-11-22");
  });
  it("today in the salon's zone, not UTC", () => {
    // 2026-11-26 03:00Z is still Nov 25 in Chicago.
    expect(todayIn(TZ, new Date("2026-11-26T03:00:00Z"))).toBe("2026-11-25");
  });
  it("formats minutes as clock time", () => {
    expect(formatMinutes(0)).toBe("12 AM");
    expect(formatMinutes(parseHHMM("15:30"))).toBe("3:30 PM");
    expect(formatMinutes(parseHHMM("12:00"))).toBe("12 PM");
  });
  it("rejects bad times", () => {
    expect(() => parseHHMM("25:00")).toThrow();
    expect(() => parseHHMM("abc")).toThrow();
  });
});

describe("time zone labels", () => {
  const winter = new Date("2026-12-01T21:30:00Z");
  const summer = new Date("2026-07-10T14:00:00Z");
  it("abbreviation follows daylight saving", () => {
    expect(tzAbbrev(winter, TZ)).toBe("CST");
    expect(tzAbbrev(summer, TZ)).toBe("CDT");
  });
  it("every formatted time carries its zone", () => {
    expect(formatTime(winter, TZ)).toBe("3:30 PM CST");
    expect(formatTime(summer, TZ)).toBe("9:00 AM CDT");
    expect(formatTimeRange(winter, new Date("2026-12-02T00:20:00Z"), TZ)).toBe("3:30 PM – 6:20 PM CST");
    expect(formatSlot("2026-07-10", parseHHMM("09:00"), TZ)).toBe("9:00 AM CDT");
  });
  it("date + time + zone", () => {
    expect(formatDateTime(winter, TZ)).toBe("Dec 1, 2026, 3:30 PM CST");
    expect(formatDateTime(winter, TZ, { weekday: true })).toBe("Tue, Dec 1, 2026, 3:30 PM CST");
    // Late evening in Chicago is the next day in UTC: date follows the salon.
    expect(formatDateTime(new Date("2026-12-02T02:30:00Z"), TZ)).toBe("Dec 1, 2026, 8:30 PM CST");
  });
  it("page label", () => {
    expect(zoneLabel(TZ, winter)).toBe("Central Time (CST)");
  });
});
