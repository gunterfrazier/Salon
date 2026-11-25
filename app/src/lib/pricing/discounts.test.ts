import { describe, expect, it } from "vitest";
import rulesJson from "../../../seed/pricing-rules.json";
import { menu, servicesByKey as s } from "../menu";
import type { MenuService } from "../schedule/plan";
import { priceAppointment, type BundleRule, type PriceLine } from "./discounts";

const rules = rulesJson.bundles as BundleRule[];
const line = (x: MenuService): PriceLine => ({ serviceKey: x.key, name: x.name, stage: x.stage, basePrice: Math.round(x.price * 100) });
const lines = (...xs: MenuService[]) => xs.map(line);

describe("menu after the split", () => {
  it("$25 women's/youth cut is gone", () => {
    expect(s.womens_youth_cut).toBeUndefined();
  });
  it("color services no longer include cut & style", () => {
    const color = menu.categories.find((c) => c.key === "color")!;
    for (const x of color.services) expect(x.includes ?? []).not.toContain("cut");
  });
});

describe("package discounts", () => {
  it("color + cut + style: 5% off the whole appointment", () => {
    const p = priceAppointment(lines(s.full_highlights, s.womens_cut, s.style), rules);
    expect(p.subtotal).toBe(12500 + 3500 + 2500);
    expect(p.total).toBe(Math.round(18500 * 0.95));
    expect(p.appliedBundles).toEqual(["color_with_cut_or_style"]);
    expect(p.lines[0].discounts[0]).toEqual({ source: "bundle", label: "Color + Cut/Style 5% off", amount: 625 });
  });

  it("color + just a style also qualifies", () => {
    expect(priceAppointment(lines(s.toner, s.style), rules).total).toBe(Math.round(6500 * 0.95));
  });

  it("no discount without color, or color alone", () => {
    expect(priceAppointment(lines(s.womens_cut, s.style), rules).totalDiscount).toBe(0);
    expect(priceAppointment(lines(s.balayage, s.olaplex), rules).totalDiscount).toBe(0);
  });

  it("package can be a dollar amount instead", () => {
    const custom: BundleRule[] = [{ ...rules[0], appliesTo: { stages: ["cut"] }, discount: { kind: "amount", value: 10 } }];
    expect(priceAppointment(lines(s.all_over_color, s.womens_cut), custom).total).toBe(9500 + 2500);
  });

  it("stylist can switch a package off for one appointment", () => {
    const p = priceAppointment(lines(s.all_over_color, s.womens_cut), rules, { disabledBundles: ["color_with_cut_or_style"] });
    expect(p.total).toBe(13000);
  });

  it("disabled-by-default 3+ services rule works when turned on", () => {
    const on = rules.map((r) => ({ ...r, enabled: r.key === "three_or_more" }));
    expect(priceAppointment(lines(s.womens_cut, s.style, s.brow_wax), on).total).toBe(Math.round(7500 * 0.9));
  });
});

describe("manual adjustments", () => {
  it("custom price for one service", () => {
    const p = priceAppointment(lines(s.balayage), rules, { priceOverrides: { 0: 150 } });
    expect(p.total).toBe(15000);
  });

  it("line discount: percent, dollars, or set price", () => {
    const one = (d: Parameters<typeof priceAppointment>[2]) => priceAppointment(lines(s.updo), rules, d).total;
    expect(one({ manual: [{ scope: "line", lineIndex: 0, discount: { kind: "percent", value: 20 }, reason: "Promotion" }] })).toBe(4400);
    expect(one({ manual: [{ scope: "line", lineIndex: 0, discount: { kind: "amount", value: 5 }, reason: "Loyal client" }] })).toBe(5000);
    expect(one({ manual: [{ scope: "line", lineIndex: 0, discount: { kind: "price", value: 40 }, reason: "Other" }] })).toBe(4000);
  });

  it("appointment discount is spread across lines and adds up exactly", () => {
    const p = priceAppointment(lines(s.womens_cut, s.style, s.brow_wax), rules, {
      manual: [{ scope: "appointment", discount: { kind: "amount", value: 10 }, reason: "Friends & family" }],
    });
    expect(p.total).toBe(7500 - 1000);
    expect(p.lines.reduce((t, l) => t + l.discounts.reduce((a, d) => a + d.amount, 0), 0)).toBe(1000);
  });

  it("never goes below $0", () => {
    const p = priceAppointment(lines(s.lip_wax), rules, { manual: [{ scope: "line", lineIndex: 0, discount: { kind: "amount", value: 100 }, reason: "Other" }] });
    expect(p.total).toBe(0);
  });
});
