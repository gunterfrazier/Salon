import { describe, expect, it } from "vitest";
import { DEFAULT_LOYALTY, earnsCardReward, expiresOn, loyaltySettings, punchCard, referralCode, rewardLabel } from "./loyalty";

describe("loyalty", () => {
  it("fills in and checks settings", () => {
    expect(loyaltySettings(undefined)).toEqual(DEFAULT_LOYALTY);
    const s = loyaltySettings({ card: { enabled: true, visits: 1, reward: { kind: "percent", value: 500 } }, referral: { enabled: true, friend: { kind: "percent", value: 10 } }, expireMonths: null });
    expect(s.card).toEqual({ enabled: true, visits: 10, reward: { kind: "percent", value: 1500 } });
    expect(s.referral.friend).toEqual({ kind: "percent", value: 10 });
    expect(s.expireMonths).toBeNull();
  });
  it("tracks the punch card and earns every Nth visit", () => {
    expect(punchCard(0, 10)).toEqual({ filled: 0, toGo: 10 });
    expect(punchCard(13, 10)).toEqual({ filled: 3, toGo: 7 });
    expect(earnsCardReward(10, 10)).toBe(true);
    expect(earnsCardReward(20, 10)).toBe(true);
    expect(earnsCardReward(11, 10)).toBe(false);
    expect(earnsCardReward(0, 10)).toBe(false);
  });
  it("labels rewards and makes referral codes", () => {
    expect(rewardLabel({ kind: "amount", value: 1500 })).toBe("$15 off");
    expect(rewardLabel({ kind: "percent", value: 20 })).toBe("20% off");
    expect(referralCode("Jamie-Lynn", () => 0)).toBe("JAMIELYNAAA");
    expect(referralCode("", () => 0.99)).toBe("FRIEND999");
  });
  it("sets an expiry date", () => {
    expect(expiresOn("2026-11-27", 12)).toBe("2027-11-27");
    expect(expiresOn("2026-11-27", null)).toBeNull();
  });
});
