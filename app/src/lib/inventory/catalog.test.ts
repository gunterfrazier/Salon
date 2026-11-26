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
    expect(count("Kenra Color")).toBe(83);
    expect(count("Shades EQ")).toBe(126);
  });

  it("marks every Shades EQ shade as Gloss and/or Bonder Inside", () => {
    const eq = lines.find((l) => l.line === "Shades EQ")!;
    for (const s of eq.shades) expect(s.types.length, s.code).toBeGreaterThan(0);
  });
});
