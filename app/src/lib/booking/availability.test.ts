import { describe, expect, it } from "vitest";
import menuJson from "../../../seed/service-menu.json";
import policyJson from "../../../seed/policies.json";
import { servicesByKey as s } from "../menu";
import { policyText, policyVersion } from "../policy/text";
import type { PolicySettings } from "../policy/types";
import { formatMinutes, parseHHMM, zonedToUtc } from "../time/zone";
import { availableStarts, bookableDates, bookingSettings, DEFAULT_BOOKING_SETTINGS, type Hours } from "./availability";

const TZ = "America/Chicago";
const hours = menuJson.hours as unknown as Hours; // Tue 3:30–7, Thu 3:30–8:30, Fri 9–4, Sat 7:15–2
const settings = { ...DEFAULT_BOOKING_SETTINGS, stepMinutes: 15 };
const now = new Date("2026-11-26T12:00:00Z");
const at = (date: string, t: string) => zonedToUtc(date, parseHHMM(t), TZ);
const times = (ms: number[]) => ms.map(formatMinutes);

describe("availableStarts", () => {
  it("closed days have nothing", () => {
    expect(availableStarts({ date: "2026-12-02", tz: TZ, hours, services: [s.womens_cut], busy: [], now, settings })).toEqual([]);
  });

  it("whole booking must end by closing time", () => {
    // Tue 3:30–7:00; women's cut 45 min → last start 6:15
    const r = availableStarts({ date: "2026-12-01", tz: TZ, hours, services: [s.womens_cut], busy: [], now, settings });
    expect(times([r[0], r[r.length - 1]])).toEqual(["3:30 PM", "6:15 PM"]);
    // Full Highlights + cut + style = 215 min: doesn't fit in 3.5 hours
    expect(availableStarts({ date: "2026-12-01", tz: TZ, hours, services: [s.full_highlights, s.womens_cut, s.style], busy: [], now, settings })).toEqual([]);
  });

  it("skips hands-on overlaps but allows booking inside processing time", () => {
    // Existing color: hands-on 3:30–4:00, processing 4:00–4:35 (open), rinse 4:35–4:50
    const busy = [
      { start: at("2026-12-01", "15:30"), end: at("2026-12-01", "16:00") },
      { start: at("2026-12-01", "16:35"), end: at("2026-12-01", "16:50") },
    ];
    const r = times(availableStarts({ date: "2026-12-01", tz: TZ, hours, services: [s.mens_boys_cut], busy, now, settings }));
    expect(r).toContain("4 PM"); // 15-min cut fits in the processing gap
    expect(r).toContain("4:15 PM");
    expect(r).not.toContain("4:30 PM"); // would overlap the rinse
    expect(r).not.toContain("4:45 PM");
    expect(r).not.toContain("3:45 PM");
    expect(r).toContain("5 PM"); // first slot after the rinse ends at 4:50
  });

  it("minimum notice", () => {
    const soon = new Date("2026-12-01T20:00:00Z"); // 2:00 PM Central; 12h notice → nothing today
    expect(availableStarts({ date: "2026-12-01", tz: TZ, hours, services: [s.womens_cut], busy: [], now: soon, settings })).toEqual([]);
  });
});

describe("booking settings and dates", () => {
  it("clamps and defaults bad settings", () => {
    expect(bookingSettings({ minNoticeHours: -5, maxDaysAhead: "x", stepMinutes: 1 })).toEqual({ minNoticeHours: 0, maxDaysAhead: 60, stepMinutes: 5 });
  });
  it("lists only open days", () => {
    expect(bookableDates("2026-11-29", hours, { ...settings, maxDaysAhead: 6 })).toEqual(["2026-12-01", "2026-12-03", "2026-12-04", "2026-12-05"]);
  });
});

describe("policy text", () => {
  const lines = policyText(policyJson as unknown as PolicySettings);
  it("matches the salon's settings", () => {
    expect(lines).toContain("New clients pay a $50 deposit to book any service (never more than the service total).");
    expect(lines).toContain("Cancelling with less than 24 hours notice is charged the full price of the booked services.");
    expect(lines.some((l) => l.includes("until 4 on-time visits"))).toBe(true);
  });
  it("version changes when wording changes", () => {
    expect(policyVersion(lines)).toBe(policyVersion([...lines]));
    expect(policyVersion(lines)).not.toBe(policyVersion([...lines, "x"]));
  });
});
