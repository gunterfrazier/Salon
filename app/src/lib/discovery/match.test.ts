import { describe, expect, it } from "vitest";
import { bestService, matchAll, score } from "./match";

const menu = [
  { id: "1", name: "Women's Cut", category: "Cut & Style" },
  { id: "2", name: "Men's or Boy's Cut", category: "Cut & Style" },
  { id: "3", name: "Full Highlights", category: "Color Services" },
  { id: "4", name: "All Over Color", category: "Color Services" },
  { id: "5", name: "Blowout", category: "Cut & Style" },
];

describe("service matching across salons", () => {
  it("scores names", () => {
    expect(score("Women's Cut", "Women's Cut")).toBe(1);
    expect(score("highlights", "Full Highlights")).toBeGreaterThan(0.8);
    expect(score("balayage", "Full Highlights")).toBe(0);
  });

  it("finds the closest service", () => {
    expect(bestService("womens haircut", menu)?.id).toBe("1");
    expect(bestService("blow dry", menu)?.id).toBe("5");
    expect(bestService("women's cut", menu)?.id).toBe("1");
    expect(bestService("highlight", menu)?.id).toBe("3");
    expect(bestService("color", menu)?.id).toBe("4");
    expect(bestService("perm", menu)).toBeNull();
  });

  it("maps a whole visit or gives up", () => {
    expect(matchAll(["All Over Color", "Women's Cut"], menu)?.map((s) => s.id)).toEqual(["4", "1"]);
    expect(matchAll(["All Over Color", "Keratin Treatment"], menu)).toBeNull();
  });
});
