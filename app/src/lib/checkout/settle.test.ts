import { describe, expect, it } from "vitest";
import { checkoutTotals, settleCancel, tipPresets } from "./settle";

describe("settleCancel", () => {
  const opts = { refundDepositIfNoCharge: true, collectNow: false };

  it("no-show, full price, $50 deposit, nothing collected now: rest goes to balance", () => {
    expect(settleCancel({ kind: "full" }, 14725, 5000, opts)).toEqual({ fee: 14725, depositApplied: 5000, collectNow: 0, balance: 9725, refund: 0 });
  });

  it("collect the rest now instead of a balance", () => {
    expect(settleCancel({ kind: "full" }, 14725, 5000, { ...opts, collectNow: true })).toMatchObject({ collectNow: 9725, balance: 0 });
  });

  it("50% fee smaller than nothing paid", () => {
    expect(settleCancel({ kind: "percent", percent: 50 }, 9500, 0, opts)).toMatchObject({ fee: 4750, balance: 4750 });
  });

  it("custom fee below the deposit refunds the difference", () => {
    expect(settleCancel({ kind: "custom", amount: 2000 }, 9500, 5000, opts)).toEqual({ fee: 2000, depositApplied: 2000, collectNow: 0, balance: 0, refund: 3000 });
  });

  it("no charge: deposit refunded (or kept, per policy)", () => {
    expect(settleCancel({ kind: "none" }, 9500, 5000, opts).refund).toBe(5000);
    expect(settleCancel({ kind: "none" }, 9500, 5000, { ...opts, refundDepositIfNoCharge: false }).refund).toBe(0);
  });

  it("can't charge more than the full price", () => {
    expect(() => settleCancel({ kind: "custom", amount: 9501 }, 9500, 0, opts)).toThrow(/exceed/);
  });
});

describe("checkoutTotals", () => {
  it("adjusted prices + tip, minus deposit, paid in full", () => {
    const t = checkoutTotals({ prices: [13000, 3325], tip: 3000, depositPaid: 5000, paid: 14325 });
    expect(t).toMatchObject({ services: 16325, total: 19325, depositApplied: 5000, due: 14325, balance: 0, tipPaid: 3000, refund: 0 });
  });

  it("partial payment leaves a balance", () => {
    expect(checkoutTotals({ prices: [9500], tip: 0, depositPaid: 0, paid: 5000 }).balance).toBe(4500);
  });

  it("deposit larger than the bill is refunded", () => {
    expect(checkoutTotals({ prices: [2000], tip: 0, depositPaid: 5000, paid: 0 })).toMatchObject({ due: 0, refund: 3000 });
  });

  it("rejects overpayment and negative amounts", () => {
    expect(() => checkoutTotals({ prices: [2000], tip: 0, depositPaid: 0, paid: 2001 })).toThrow(/more than/);
    expect(() => checkoutTotals({ prices: [-1], tip: 0, depositPaid: 0, paid: 0 })).toThrow();
  });

  it("retail: deposit covers services first, payment covers tip then retail", () => {
    const t = checkoutTotals({ prices: [3000], retail: 2400, tip: 1000, depositPaid: 5000, paid: 1400 });
    expect(t).toMatchObject({ services: 3000, retail: 2400, total: 6400, depositApplied: 5000, due: 1400, tipPaid: 1000, retailPaid: 400, balance: 0 });
    // Deposit only covers part of services: today's payment pays tip, retail, then services.
    expect(checkoutTotals({ prices: [9000], retail: 2400, tip: 1500, depositPaid: 5000, paid: 7900 })).toMatchObject({ tipPaid: 1500, retailPaid: 2400, balance: 0 });
    // Short payment: tip and retail first, the rest of services goes to balance.
    expect(checkoutTotals({ prices: [9000], retail: 2400, tip: 1500, depositPaid: 0, paid: 5000 })).toMatchObject({ tipPaid: 1500, retailPaid: 2400, balance: 7900 });
  });

  it("tip presets", () => {
    expect(tipPresets(10000)).toEqual([{ percent: 15, amount: 1500 }, { percent: 20, amount: 2000 }, { percent: 25, amount: 2500 }]);
  });
});
