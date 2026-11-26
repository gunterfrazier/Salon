import { describe, expect, it } from "vitest";
import { computePay, rentForRange, type PayPlan } from "./compute";

const plan = (x: Partial<PayPlan>): PayPlan => ({ staffId: "s", name: "S", payType: "none", servicePct: 0, retailPct: 0, rentCents: 0, rentPeriod: "week", collectsOwn: true, ...x });

describe("rentForRange", () => {
  it("prorates weekly rent by days", () => {
    expect(rentForRange(20000, "week", "2026-12-07", "2026-12-13")).toBe(20000);
    expect(rentForRange(20000, "week", "2026-12-01", "2026-12-31")).toBe(Math.round((20000 * 31) / 7));
  });
  it("charges a whole month for a whole month, and splits partial months by their days", () => {
    expect(rentForRange(80000, "month", "2026-02-01", "2026-02-28")).toBe(80000);
    expect(rentForRange(80000, "month", "2026-12-01", "2026-12-31")).toBe(80000);
    expect(rentForRange(80000, "month", "2026-11-16", "2026-12-15")).toBe(Math.round((80000 * 15) / 30 + (80000 * 15) / 31));
    expect(rentForRange(80000, "month", "2026-12-01", "2027-01-31")).toBe(160000);
    expect(rentForRange(0, "month", "2026-12-01", "2026-12-31")).toBe(0);
  });
});

describe("computePay", () => {
  const base = { from: "2026-12-07", to: "2026-12-13", rentPaid: [] as { staffId: string; cents: number }[] };
  it("pays commission on services and retail, plus all tips", () => {
    const [r] = computePay({
      ...base,
      plans: [plan({ staffId: "a", payType: "commission", servicePct: 40, retailPct: 10 })],
      services: [{ staffId: "a", cents: 10000 }, { staffId: "a", cents: 5000 }, { staffId: "b", cents: 9999 }],
      retail: [{ staffId: "a", cents: 3000 }],
      tips: [{ staffId: "a", cents: 2500 }],
    });
    expect(r).toMatchObject({ visits: 2, services: 15000, retail: 3000, tips: 2500, commission: 6300, payout: 8800 });
  });

  it("booth renter who takes their own payments just owes rent", () => {
    const [r] = computePay({ ...base, plans: [plan({ staffId: "a", payType: "booth_rent", rentCents: 20000 })], services: [{ staffId: "a", cents: 50000 }], retail: [], tips: [], rentPaid: [{ staffId: "a", cents: 5000 }] });
    expect(r).toMatchObject({ payout: 0, rentDue: 20000, rentPaid: 5000, rentOwed: 15000 });
  });

  it("booth renter paid through the salon gets their money minus unpaid rent", () => {
    const [r] = computePay({ ...base, plans: [plan({ staffId: "a", payType: "booth_rent", rentCents: 20000, collectsOwn: false })], services: [{ staffId: "a", cents: 50000 }], retail: [], tips: [{ staffId: "a", cents: 4000 }] });
    expect(r).toMatchObject({ payout: 34000, rentDue: 20000, rentOwed: 0 });
    const [low] = computePay({ ...base, plans: [plan({ staffId: "a", payType: "booth_rent", rentCents: 20000, collectsOwn: false })], services: [{ staffId: "a", cents: 8000 }], retail: [], tips: [] });
    expect(low).toMatchObject({ payout: 0, rentOwed: 12000 });
  });

  it("no plan pays nothing but still shows tips", () => {
    const [r] = computePay({ ...base, plans: [plan({ staffId: "a" })], services: [{ staffId: "a", cents: 5000 }], retail: [], tips: [{ staffId: "a", cents: 700 }] });
    expect(r).toMatchObject({ payout: 0, tips: 700, commission: 0 });
  });
});
