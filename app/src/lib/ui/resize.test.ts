import { describe, expect, it } from "vitest";
import { hasTransparency } from "./resize";

const px = (alphas: number[]) => new Uint8ClampedArray(alphas.flatMap((a) => [10, 20, 30, a]));

describe("logo transparency", () => {
  it("finds a see-through background", () => {
    expect(hasTransparency(px([...Array(900).fill(255), ...Array(100).fill(0)]))).toBe(true);
  });
  it("ignores a solid picture and a few soft edge pixels", () => {
    expect(hasTransparency(px(Array(1000).fill(255)))).toBe(false);
    expect(hasTransparency(px([...Array(995).fill(255), ...Array(5).fill(120)]))).toBe(false);
  });
});
