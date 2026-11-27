import { describe, expect, it } from "vitest";
import catalog from "../../../seed/color-catalog.json";

describe("color catalog seed", () => {
  const lines = catalog.brands.flatMap((b) => b.lines.map((l) => ({ brand: b.brand, ...l })));

  it("has no duplicate shade codes within a line", () => {
    for (const l of lines) {
      const codes = l.shades.map((s) => s.code);
      expect(new Set(codes).size, `${l.brand} ${l.line}`).toBe(codes.length);
    }
  });

  it("covers the Kenra Color and Shades EQ charts", () => {
    const count = (name: string) => lines.find((l) => l.line === name)?.shades.length;
    expect(count("Kenra Color")).toBe(87);
    expect(count("Shades EQ")).toBe(126);
  });

  it("includes the lines from the supplier master list", () => {
    const count = (name: string) => lines.find((l) => l.line === name)?.shades.length;
    expect(count("Koleston Perfect ME+")).toBe(51);
    expect(count("Illumina Color")).toBe(13);
    expect(count("IGORA Royal")).toBe(84);
    expect(count("Color Gels Lacquers")).toBe(5);
    expect(count("Super Sync Pre-Bonded")).toBe(58);
    expect(count("LumiShine Demi-Permanent Liquid")).toBe(63);
    expect(count("Semi-Permanent")).toBe(15);
  });

  it("marks every Shades EQ shade as Gloss and/or Bonder Inside", () => {
    const eq = lines.find((l) => l.line === "Shades EQ")!;
    for (const s of eq.shades) expect("types" in s ? s.types.length : 0, s.code).toBeGreaterThan(0);
  });
});
