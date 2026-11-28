import { describe, expect, it } from "vitest";
import { applySickDiscount, classify, cleanSickSettings, DEFAULT_SICK, optionAllowed, optionBadge, sickDiscount } from "./rules";

const tz = "America/Chicago";
const orig = new Date("2026-12-01T16:00:00Z"); // 10:00 Central

describe("sick days", () => {
  it("reads settings safely", () => {
    expect(cleanSickSettings(null)).toEqual(DEFAULT_SICK);
    const s = cleanSickSettings({ discounts: true, stack: true, windowMinutes: 5, options: { otherDaySame: { kind: "percent", value: 150, salonShare: -3 } } });
    expect(s.windowMinutes).toBe(15);
    expect(s.options.otherDaySame).toMatchObject({ value: 100, salonShare: 0 });
    expect(s.options.sameWindowOther).toEqual(DEFAULT_SICK.options.sameWindowOther);
  });

  it("knows which option a new time is", () => {
    const at = (iso: string, staff: string) => classify({ origStart: orig, origStaff: "sick", start: new Date(iso), staff, tz, windowMinutes: 60 });
    expect(at("2026-12-01T16:45:00Z", "sub")).toBe("sameWindowOther");
    expect(at("2026-12-01T20:00:00Z", "sub")).toBe("sameDayOther");
    expect(at("2026-12-03T16:00:00Z", "sick")).toBe("otherDaySame");
    expect(at("2026-12-03T16:00:00Z", "sub")).toBe("otherDayOther");
    expect(at("2026-12-01T20:00:00Z", "sick")).toBeNull();
    // 11 PM Central is still the same salon day even though it's the next day in UTC.
    expect(at("2026-12-02T05:00:00Z", "sub")).toBe("sameDayOther");
  });

  it("works out discounts and who pays", () => {
    const on = cleanSickSettings({ discounts: true });
    expect(sickDiscount(on, "sameWindowOther", 3500)).toEqual({ cents: 500, salon: 500, stylist: 0 });
    expect(sickDiscount(on, "otherDaySame", 9500)).toEqual({ cents: 1900, salon: 950, stylist: 950 });
    expect(sickDiscount(on, "sameDayOther", 600)).toMatchObject({ cents: 600 });
    expect(sickDiscount(DEFAULT_SICK, "otherDaySame", 9500).cents).toBe(0);
    expect(optionBadge(on, "otherDaySame")).toBe("20% off");
    expect(optionBadge(on, "sameWindowOther")).toBe("$5 off");
    expect(optionAllowed(cleanSickSettings({ substitutes: false }), "sameDayOther")).toBe(false);
    expect(optionAllowed(cleanSickSettings({ substitutes: false }), "otherDaySame")).toBe(true);
  });

  it("stacks, or gives the better of the two", () => {
    const lines = [
      { service_id: "a", list_price_cents: 9500, price_quoted_cents: 9000, discounts: [{ source: "bundle", label: "Package", amount_cents: 500 }] },
      { service_id: "b", list_price_cents: 3500, price_quoted_cents: 3500, discounts: [] },
    ];
    const stacked = applySickDiscount(lines, 1000, true);
    expect(stacked.applied).toBe(1000);
    expect(stacked.lines.reduce((n, l) => n + l.price_quoted_cents, 0)).toBe(11500);
    expect(stacked.lines[0].discounts.map((d) => d.source)).toEqual(["bundle", "sick_day"]);
    // Not stacking: $3 is less than the $5 package saving, so nothing changes.
    expect(applySickDiscount(lines, 300, false)).toEqual({ lines, applied: 0 });
    // Not stacking: $10 beats $5, so it replaces it.
    const better = applySickDiscount(lines, 1000, false);
    expect(better.lines.reduce((n, l) => n + l.price_quoted_cents, 0)).toBe(12000);
    expect(better.lines.flatMap((l) => l.discounts.map((d) => d.source))).toEqual(["sick_day", "sick_day"]);
  });
});
