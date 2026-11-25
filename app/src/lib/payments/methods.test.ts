import { describe, expect, it } from "vitest";
import methodsJson from "../../../../seed/payment-methods.json";
import { bookingGuarantee, paymentRequest, validateHandle, type PaymentMethod } from "./methods";

const all = methodsJson.methods as PaymentMethod[];
const m = (key: string, handle?: string) => ({ ...all.find((x) => x.key === key)!, handle });

describe("payment requests", () => {
  it("Venmo, Cash App and PayPal.Me links prefill the amount", () => {
    expect(paymentRequest(m("venmo_direct", "@StyledByK"), 5000, "Deposit Dec 2").url).toBe("https://venmo.com/StyledByK?txn=pay&amount=50.00&note=Deposit%20Dec%202");
    expect(paymentRequest(m("cash_app_direct", "$StyledByK"), 5000, "x").url).toBe("https://cash.app/$StyledByK/50.00");
    expect(paymentRequest(m("paypal_me", "StyledByK"), 12550, "x").url).toBe("https://paypal.me/StyledByK/125.50USD");
  });

  it("Zelle and Apple Cash show instructions instead of a link", () => {
    const z = paymentRequest(m("zelle", "stylist@example.com"), 5000, "Deposit Dec 2");
    expect(z.url).toBeNull();
    expect(z.instructions).toContain("stylist@example.com");
    expect(paymentRequest(m("apple_cash", "(555) 010-0000"), 5000, "x").url).toBeNull();
  });

  it("requires a handle", () => {
    expect(() => paymentRequest(m("zelle"), 5000, "x")).toThrow(/Settings > Payments/);
  });

  it("checkout methods aren't payment requests", () => {
    expect(() => paymentRequest(m("card"), 5000, "x")).toThrow();
  });
});

describe("booking guarantee", () => {
  it("saved card / wallet: deposit charged now, fees can be charged later", () => {
    expect(bookingGuarantee(m("google_pay"), 5000)).toEqual({ kind: "saved_method", payNow: 5000 });
  });
  it("Zelle with a deposit due: booking pending until paid", () => {
    expect(bookingGuarantee(m("zelle", "x"), 12500)).toEqual({ kind: "prepay_to_confirm", payNow: 12500 });
  });
  it("Zelle with nothing due: booked, any fee becomes a balance owed", () => {
    expect(bookingGuarantee(m("zelle", "x"), 0)).toEqual({ kind: "unsecured", payNow: 0 });
  });
});

describe("handle checks", () => {
  it("cleans up what people type", () => {
    expect(validateHandle("venmo_direct", "@Styled-By_K")).toEqual({ ok: true, value: "Styled-By_K" });
    expect(validateHandle("cash_app_direct", "$StyledByK")).toEqual({ ok: true, value: "StyledByK" });
    expect(validateHandle("paypal_me", "https://paypal.me/StyledByK")).toEqual({ ok: true, value: "StyledByK" });
    expect(validateHandle("zelle", "555.010.0000")).toEqual({ ok: true, value: "(555) 010-0000" });
    expect(validateHandle("apple_cash", "+1 555 010 0000")).toEqual({ ok: true, value: "(555) 010-0000" });
    expect(validateHandle("zelle", "Me@Example.com")).toEqual({ ok: true, value: "me@example.com" });
  });
  it("rejects bad input", () => {
    expect(validateHandle("venmo_direct", "ab").ok).toBe(false);
    expect(validateHandle("cash_app_direct", "$1abc").ok).toBe(false);
    expect(validateHandle("zelle", "not a phone").ok).toBe(false);
    expect(validateHandle("zelle", "").ok).toBe(false);
  });
});

describe("defaults", () => {
  it("every method is available; only cash starts on", () => {
    expect(all.filter((x) => x.enabled).map((x) => x.key)).toEqual(["cash"]);
    expect(all.map((x) => x.key)).toEqual(expect.arrayContaining(["card", "google_pay", "apple_pay", "cash_app_pay", "paypal", "venmo", "venmo_direct", "cash_app_direct", "paypal_me", "zelle", "apple_cash", "cash"]));
  });
});
