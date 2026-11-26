import { describe, expect, it } from "vitest";
import menuJson from "../../../seed/service-menu.json";
import { servicesByKey as s } from "../menu";
import { holidayOn, mergeHolidays } from "../schedule/holidays";
import { formatMinutes, parseHHMM, zonedToUtc } from "../time/zone";
import { DEFAULT_BOOKING_SETTINGS, type Hours } from "./availability";
import { cleanFavorites, findOpenings, searchDays, type SearchCriteria } from "./search";

const TZ = "America/Chicago";
const hours = menuJson.hours as unknown as Hours; // Tue 3:30–7, Thu 3:30–8:30, Fri 9–4, Sat 7:15–2
const rules = mergeHolidays(null);
const base = {
  services: [s.womens_cut],
  today: "2026-11-26",
  tz: TZ,
  hours,
  isClosed: (d: string) => !!holidayOn(d, rules),
  busy: [],
  now: new Date("2026-11-26T12:00:00Z"),
  settings: DEFAULT_BOOKING_SETTINGS,
  horizonDays: 120,
};
const crit = (c: Partial<SearchCriteria>): SearchCriteria => ({ weekdays: [], block: "any", start: { kind: "next" }, ...c });
const show = (o: { date: string; minutes: number }[]) => o.map((x) => `${x.date} ${formatMinutes(x.minutes)}`);

describe("findOpenings", () => {
  it("next available skips Thanksgiving week closures (Thu, Fri) and starts Sat", () => {
    const r = findOpenings({ ...base, criteria: crit({}), limit: 2 });
    expect(show(r)).toEqual(["2026-11-28 7:15 AM", "2026-11-28 7:30 AM"]);
  });

  it("Fridays, mornings only", () => {
    const r = findOpenings({ ...base, criteria: crit({ weekdays: [5], block: "morning" }), limit: 50, perDay: 50 });
    expect(new Set(r.map((x) => x.date)).has("2026-12-04")).toBe(true);
    expect(r.every((x) => new Date(x.date + "T12:00:00Z").getUTCDay() === 5)).toBe(true);
    expect(r.every((x) => x.minutes < 12 * 60)).toBe(true);
    expect(r.some((x) => x.date === "2026-12-25")).toBe(false); // Christmas closed
  });

  it("multiple days and a custom time window", () => {
    const r = findOpenings({ ...base, criteria: crit({ weekdays: [2, 4], block: { from: parseHHMM("17:00"), to: parseHHMM("19:00") } }), limit: 4, perDay: 2 });
    expect(show(r)).toEqual(["2026-12-01 5 PM", "2026-12-01 5:15 PM", "2026-12-03 5 PM", "2026-12-03 5:15 PM"]);
  });

  it("4 weeks out: that day first, then nearby days", () => {
    // 4 weeks from Thu Nov 26 = Thu Dec 24 (Christmas Eve, closed) → Tue 22 / Sat 26 / Fri 25 (closed)...
    const days = searchDays({ kind: "weeks", weeks: 4 }, "2026-11-26", 120);
    expect(days).toEqual(["2026-12-24", "2026-12-23", "2026-12-25", "2026-12-22", "2026-12-26", "2026-12-21", "2026-12-27"]);
    const r = findOpenings({ ...base, criteria: crit({ start: { kind: "weeks", weeks: 4 } }), limit: 1 });
    expect(r[0].date).toBe("2026-12-22");
  });

  it("busy time removes overlapping openings", () => {
    const busy = [{ start: zonedToUtc("2026-12-01", parseHHMM("15:30"), TZ), end: zonedToUtc("2026-12-01", parseHHMM("17:00"), TZ) }];
    const r = findOpenings({ ...base, busy, criteria: crit({ weekdays: [2] }), limit: 1 });
    expect(show(r)).toEqual(["2026-12-01 5 PM"]);
  });
});

describe("favorites", () => {
  it("cleans and validates", () => {
    expect(cleanFavorites({ serviceIds: ["a", 3], weekdays: [5, 5, 9, 1], block: "morning" })).toEqual({ serviceIds: ["a"], weekdays: [1, 5], block: "morning" });
    expect(cleanFavorites({ block: { from: 600, to: 500 } })).toBeNull();
    expect(cleanFavorites(null)).toBeNull();
  });
});
