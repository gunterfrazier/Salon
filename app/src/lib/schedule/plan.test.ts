import { describe, expect, it } from "vitest";
import { menu, servicesByKey as s } from "../menu";
import { planAppointment, suggestOrder } from "./plan";

const start = new Date("2026-11-28T15:00:00Z");
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

describe("stacked appointments", () => {
  it("cut + style: times and prices add up, each billed separately", () => {
    const p = planAppointment(start, [s.womens_youth_cut, s.style]);
    expect(p.totalMinutes).toBe(90);
    expect(hhmm(p.end)).toBe("16:30");
    expect(p.lines.map((l) => [l.name, l.price])).toEqual([
      ["Women's or Youth Female's Cut", 2500],
      ["Style", 2500],
    ]);
    expect(p.estimatedTotal).toBe(5000);
    expect(p.priceMayVary).toBe(true);
    expect(p.warnings).toEqual([]);
  });

  it("color + treatment + wax: processing gaps stay open for other clients", () => {
    const p = planAppointment(start, [s.all_over_color, s.olaplex, s.brow_wax]);
    expect(p.totalMinutes).toBe(150 + 45 + 15);
    expect(p.estimatedTotal).toBe(9500 + 5500 + 1500);
    expect(p.openGaps.map((g) => [hhmm(g.start), hhmm(g.end)])).toEqual([
      ["15:30", "16:05"], // color processing
      ["17:40", "18:00"], // olaplex processing
    ]);
    // Busy blocks are everything else, merged.
    expect(p.busy.map((g) => [hhmm(g.start), hhmm(g.end)])).toEqual([
      ["15:00", "15:30"],
      ["16:05", "17:40"], // color finish + olaplex application
      ["18:00", "18:30"], // olaplex finish + brow wax
    ]);
  });

  it("warns when a stacked service is already included", () => {
    const p = planAppointment(start, [s.full_highlights, s.womens_cut, s.style]);
    expect(p.warnings.map((w) => w.serviceKey)).toEqual(["womens_cut", "style"]);
    expect(p.warnings[0].message).toMatch(/already included/);
  });

  it("travel fee can't be booked alone", () => {
    expect(planAppointment(start, [s.travel_fee]).warnings[0].kind).toBe("add_on_alone");
  });

  it("suggested order: color, treatment, cut, style, wax", () => {
    const ordered = suggestOrder([s.brow_wax, s.style, s.womens_cut, s.olaplex, s.toner], menu.stages);
    expect(ordered.map((x) => x.key)).toEqual(["toner", "olaplex", "womens_cut", "style", "brow_wax"]);
  });

  it("every menu service's phases add up to a positive length", () => {
    for (const c of menu.categories) for (const x of c.services) expect(x.active + x.processing + x.finish).toBeGreaterThan(0);
  });
});
