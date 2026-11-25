import { describe, expect, it } from "vitest";
import { businessRow, categoryRows, serviceRows, stripNotes } from "./seed";

describe("first-run seed", () => {
  const cats = categoryRows("b1");
  const ids = Object.fromEntries(cats.map((c) => [c.key, `cat-${c.key}`]));
  const services = serviceRows("b1", ids);

  it("loads all 18 services with prices in cents and a category", () => {
    expect(services).toHaveLength(18);
    expect(services.every((s) => s.category_id?.startsWith("cat-"))).toBe(true);
    const fh = services.find((s) => s.key === "full_highlights")!;
    expect(fh).toMatchObject({ price_cents: 12500, price_type: "starting_at", stage: "chemical", includes: ["color"], price_needs_review: true, styleseat_price_cents: 12500, active_min: 75, processing_min: 35, finish_min: 15 });
  });

  it("business settings come from the seed files without comment keys", () => {
    const b = businessRow("Intensity Salon");
    expect(b.name).toBe("Intensity Salon");
    expect(b.timezone).toBe("America/Chicago");
    expect(JSON.stringify(b)).not.toMatch(/"_/);
    expect(b.business_hours).toMatchObject({ tue: ["15:30", "19:00"], mon: null });
    expect((b.policy_settings as { flags: { clearAfterOnTimeVisits: number } }).flags.clearAfterOnTimeVisits).toBe(4);
  });

  it("stripNotes keeps everything else", () => {
    expect(stripNotes({ a: 1, _x: 2, b: [{ _y: 1, c: 3 }] })).toEqual({ a: 1, b: [{ c: 3 }] });
  });
});
