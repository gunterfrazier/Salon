import { describe, expect, it } from "vitest";
import { shortSlug, slugAllowed } from "./short-links";

describe("short salon links", () => {
  it("reads a salon address from a one-part path", () => {
    expect(shortSlug("/intensity-salon")).toBe("intensity-salon");
    expect(shortSlug("/Intensity-Salon/")).toBe("intensity-salon");
  });
  it("leaves the site's own pages alone", () => {
    for (const p of ["/app", "/find", "/join", "/privacy", "/s/intensity-salon", "/", "/ab", "/a.png", "/-x"]) expect(shortSlug(p)).toBeNull();
  });
  it("blocks reserved words as salon addresses", () => {
    expect(slugAllowed("app")).toBe(false);
    expect(slugAllowed("ab")).toBe(false);
    expect(slugAllowed("glow-studio")).toBe(true);
  });
});
