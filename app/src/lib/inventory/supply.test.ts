import { describe, expect, it } from "vitest";
import { findBrand, lineInfo, linesFor, parseSize, soldAt, SUPPLY_BRANDS } from "./supply";

describe("supply catalog", () => {
  it("knows the brands, split into one per name", () => {
    expect(SUPPLY_BRANDS.length).toBeGreaterThan(40);
    expect(SUPPLY_BRANDS).toContain("KMS");
    expect(new Set(SUPPLY_BRANDS).size).toBe(SUPPLY_BRANDS.length);
  });
  it("matches brands typed loosely", () => {
    expect(findBrand("kenra")).toBe("Kenra Professional");
    expect(findBrand("Wella")).toBe("Wella Professionals");
    expect(findBrand("loreal professionnel")).toBe(null);
    expect(findBrand("L'Oréal Professionnel")).toBe("L'Oréal Professionnel");
    expect(findBrand("")).toBe(null);
  });
  it("suggests lines and fills in type and size", () => {
    expect(linesFor("Redken")[0]).toBe("Color Gels Lacquers");
    expect(linesFor("Redken")).toContain("All Soft");
    expect(lineInfo("redken", "shades eq gloss")).toMatchObject({ kind: "color", size: 2, unit: "oz" });
    expect(lineInfo("Wella", "Welloxon Perfect")).toMatchObject({ kind: "developer", size: 33.8 });
    expect(lineInfo("Joico", "Blonde Life Lightening Powder")).toMatchObject({ kind: "lightener", size: 16 });
    expect(lineInfo("Redken", "Not a line")).toBe(null);
  });
  it("reads pack sizes", () => {
    expect(parseSize("Tube (2.05 oz)")).toEqual({ size: 2.05, unit: "oz" });
    expect(parseSize("Tub")).toEqual({ size: null, unit: null });
  });
  it("says where a brand is sold", () => {
    expect(soldAt("Matrix")).toEqual(["SalonCentric", "CosmoProf"]);
    expect(soldAt("Nobody")).toEqual([]);
  });
});
