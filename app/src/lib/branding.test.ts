import { describe, expect, it } from "vitest";
import { ACCENT_PRESETS, accentStyle, branding, contrast, onAccent } from "./branding";

describe("branding", () => {
  it("keeps only valid values", () => {
    const id = "0b2a3c4d-1111-2222-3333-444455556666";
    expect(branding({ accent: "#B76E79", logoPath: `${id}/logo.png`, coverPath: "../../etc/passwd" })).toEqual({ accent: "#b76e79", logoPath: `${id}/logo.png`, coverPath: null, logoStyle: "badge", logoTint: "original" });
    expect(branding({ logoStyle: "free", logoTint: "white" })).toMatchObject({ logoStyle: "free", logoTint: "white" });
    expect(branding({ logoStyle: "huge", logoTint: "neon" })).toMatchObject({ logoStyle: "badge", logoTint: "original" });
    expect(branding({ accent: "red" }).accent).toBeNull();
  });
  it("picks readable text on the accent", () => {
    expect(onAccent("#141417")).toBe("#ffffff");
    expect(onAccent("#c8a96a")).toBe("#0f0f11");
    for (const [, hex] of ACCENT_PRESETS) expect(contrast(hex, onAccent(hex))).toBeGreaterThanOrEqual(4.5);
    expect(accentStyle({ accent: null })).toBeUndefined();
    expect(accentStyle({ accent: "#3f6a84" })).toEqual({ "--accent": "#3f6a84", "--on-accent": "#ffffff" });
  });
});
