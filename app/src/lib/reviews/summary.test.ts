import { describe, expect, it } from "vitest";
import { cleanReview, displayName, statusFor, summarize } from "./summary";

describe("reviews", () => {
  it("summarizes ratings", () => {
    expect(summarize([5, 5, 4, 3, 9, 0])).toEqual({ count: 4, average: 4.3, histogram: [0, 0, 1, 1, 2] });
    expect(summarize([])).toEqual({ count: 0, average: null, histogram: [0, 0, 0, 0, 0] });
  });
  it("shows first name and last initial only", () => {
    expect(displayName("Jamie Lynn", "rivers")).toBe("Jamie R.");
    expect(displayName("Morgan", null)).toBe("Morgan");
    expect(displayName("", "X")).toBe("A client");
  });
  it("publishes only good reviews the client agreed to share", () => {
    expect(statusFor(5, true)).toBe("published");
    expect(statusFor(4, false)).toBe("private");
    expect(statusFor(3, true)).toBe("private");
  });
  it("checks the rating and trims the text", () => {
    expect(cleanReview(0, "x")).toMatchObject({ ok: false });
    expect(cleanReview("5", "  Loved it!  ")).toEqual({ ok: true, rating: 5, body: "Loved it!" });
    expect(cleanReview(4, "   ")).toEqual({ ok: true, rating: 4, body: null });
  });
});
