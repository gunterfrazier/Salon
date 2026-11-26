import { describe, expect, it } from "vitest";
import { depositMethods, mergeMethods, NOT_YET_AVAILABLE } from "./settings";

describe("payment settings", () => {
  it("defaults: everything listed, only cash on", () => {
    const m = mergeMethods(null);
    expect(m.filter((x) => x.enabled).map((x) => x.key)).toEqual(["cash"]);
  });

  it("saved switches and handles override defaults", () => {
    const m = mergeMethods({ methods: [{ key: "zelle", enabled: true, handle: "(256) 555-0101" }, { key: "venmo_direct", enabled: false, handle: "StyledByK" }] });
    expect(m.find((x) => x.key === "zelle")).toMatchObject({ enabled: true, handle: "(256) 555-0101" });
    expect(m.find((x) => x.key === "venmo_direct")).toMatchObject({ enabled: false, handle: "StyledByK" });
  });

  it("deposit options = switched-on send-to-me apps with details (not cash)", () => {
    const m = mergeMethods({ methods: [{ key: "zelle", enabled: true, handle: "x@y.com" }, { key: "venmo_direct", enabled: true, handle: "" }] });
    expect(depositMethods(m).map((x) => x.key)).toEqual(["zelle"]);
  });

  it("Stripe and PayPal checkout can't be switched on yet", () => {
    expect([...NOT_YET_AVAILABLE].sort()).toEqual(["apple_pay", "card", "cash_app_pay", "google_pay", "paypal", "venmo"]);
  });
});
