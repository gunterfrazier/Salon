import { describe, expect, it } from "vitest";
import { closureOn, easterSunday, holidayDate, holidayOn, mergeHolidays, nextOccurrence, PRESET_HOLIDAYS, type HolidayRule } from "./holidays";

const preset = (k: string) => PRESET_HOLIDAYS.find((p) => p.key === k)!;

describe("holiday dates", () => {
  it("floating holidays", () => {
    expect(holidayDate(preset("thanksgiving"), 2026)).toBe("2026-11-26");
    expect(holidayDate(preset("thanksgiving"), 2027)).toBe("2027-11-25");
    expect(holidayDate(preset("black_friday"), 2026)).toBe("2026-11-27");
    expect(holidayDate(preset("memorial_day"), 2026)).toBe("2026-05-25"); // last Monday
    expect(holidayDate(preset("labor_day"), 2026)).toBe("2026-09-07");
    expect(holidayDate(preset("mothers_day"), 2027)).toBe("2027-05-09");
    expect(holidayDate(preset("mlk_day"), 2027)).toBe("2027-01-18");
  });
  it("Easter and Good Friday", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2038)).toBe("2038-04-25");
    expect(holidayDate(preset("good_friday"), 2027)).toBe("2027-03-26");
  });
  it("fixed dates, including impossible ones", () => {
    expect(holidayDate(preset("christmas"), 2026)).toBe("2026-12-25");
    expect(holidayDate({ key: "x", name: "Feb 29", date: { type: "fixed", month: 2, day: 29 }, closed: true }, 2027)).toBeNull();
    expect(holidayDate({ key: "x", name: "Feb 29", date: { type: "fixed", month: 2, day: 29 }, closed: true }, 2028)).toBe("2028-02-29");
  });
});

describe("closures", () => {
  const rules = mergeHolidays(null);
  it("default closed holidays", () => {
    expect(rules.filter((r) => r.closed).map((r) => r.key)).toEqual(["new_years_day", "memorial_day", "independence_day", "labor_day", "thanksgiving", "black_friday", "christmas_eve", "christmas"]);
    expect(holidayOn("2026-11-26", rules)?.name).toBe("Thanksgiving");
    expect(holidayOn("2026-12-24", rules)?.name).toBe("Christmas Eve");
    expect(holidayOn("2026-11-27", rules)?.name).toBe("Day after Thanksgiving");
    expect(holidayOn("2026-12-31", rules)).toBeNull(); // New Year's Eve open by default
  });
  it("saved switches and custom holidays", () => {
    const custom: HolidayRule = { key: "custom_bday", name: "Salon anniversary", date: { type: "fixed", month: 3, day: 14 }, closed: true, custom: true };
    const r = mergeHolidays({ rules: [{ ...preset("christmas_eve"), closed: false }, { ...preset("new_years_eve"), closed: true }, { ...preset("thanksgiving"), closed: false }, custom] });
    expect(holidayOn("2026-12-24", r)).toBeNull();
    expect(holidayOn("2026-12-31", r)?.name).toBe("New Year's Eve");
    expect(holidayOn("2026-11-26", r)).toBeNull();
    expect(holidayOn("2027-03-14", r)?.name).toBe("Salon anniversary");
  });
  it("next occurrence rolls into next year", () => {
    expect(nextOccurrence(preset("independence_day"), "2026-11-26")).toBe("2027-07-04");
    expect(nextOccurrence(preset("thanksgiving"), "2026-11-26")).toBe("2026-11-26");
  });
  it("one-time days off and blocked hours", () => {
    const dayStart = new Date("2026-12-03T06:00:00Z");
    const dayEnd = new Date("2026-12-04T06:00:00Z");
    const vacation = { id: "1", start: "2026-12-02T06:00:00Z", end: "2026-12-05T06:00:00Z", reason: "Vacation", allDay: true };
    const dentist = { id: "2", start: "2026-12-03T21:00:00Z", end: "2026-12-03T23:00:00Z", reason: "Dentist", allDay: false };
    expect(closureOn("2026-12-03", rules, [vacation], dayStart, dayEnd)).toEqual({ kind: "day_off", label: "Vacation" });
    expect(closureOn("2026-12-03", rules, [dentist], dayStart, dayEnd)).toEqual({ kind: "blocked_hours", label: "Dentist" });
    expect(closureOn("2026-11-26", rules, [], dayStart, dayEnd)).toEqual({ kind: "holiday", label: "Thanksgiving" });
    expect(closureOn("2026-12-03", rules, [], dayStart, dayEnd)).toBeNull();
  });
});
