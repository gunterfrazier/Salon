import { describe, expect, it } from "vitest";
import { cleanPromo, normalizeCode, promoDiscounts, promoLabel, promoProblem, type Promo } from "./promo";

const p: Promo = { id: "p", code: "FALL20", description: null, kind: "percent", value: 20, serviceIds: null, newClientsOnly: false, minSpendCents: 0, startsOn: "2026-11-01", endsOn: "2026-11-30", maxUses: 10, perClient: 1, active: true };
const ok = { date: "2026-11-15", newClient: false, clientUses: 0, totalUses: 0 };

describe("promo codes", () => {
  it("normalizes and labels", () => {
    expect(normalizeCode(" fall-20 ")).toBe("FALL20");
    expect(promoLabel(p)).toBe("20% off");
    expect(promoLabel({ kind: "amount", value: 1000 })).toBe("$10 off");
    expect(promoLabel({ kind: "amount", value: 750 })).toBe("$7.50 off");
  });
  it("checks dates, limits and new-client codes", () => {
    expect(promoProblem(p, ok)).toBeNull();
    expect(promoProblem(p, { ...ok, date: "2026-12-01" })).toMatch(/expired/);
    expect(promoProblem(p, { ...ok, date: "2026-10-31" })).toMatch(/yet/);
    expect(promoProblem(p, { ...ok, totalUses: 10 })).toMatch(/used up/);
    expect(promoProblem(p, { ...ok, clientUses: 1 })).toMatch(/already used/);
    expect(promoProblem({ ...p, newClientsOnly: true }, ok)).toMatch(/new clients/);
    expect(promoProblem({ ...p, active: false }, ok)).toMatch(/active/);
  });
  it("takes a percent off each eligible service", () => {
    expect(promoDiscounts(p, [{ serviceId: "a", cents: 10000 }, { serviceId: "b", cents: 3500 }])).toEqual({ perLine: [2000, 700], total: 2700, problem: null });
    expect(promoDiscounts({ ...p, serviceIds: ["b"] }, [{ serviceId: "a", cents: 10000 }, { serviceId: "b", cents: 3500 }]).perLine).toEqual([0, 700]);
    expect(promoDiscounts({ ...p, serviceIds: ["z"] }, [{ serviceId: "a", cents: 10000 }]).problem).toMatch(/doesn't apply/);
  });
  it("spreads a dollar amount by price, never below zero", () => {
    expect(promoDiscounts({ ...p, kind: "amount", value: 1000 }, [{ serviceId: "a", cents: 7000 }, { serviceId: "b", cents: 3000 }])).toEqual({ perLine: [700, 300], total: 1000, problem: null });
    expect(promoDiscounts({ ...p, kind: "amount", value: 1000 }, [{ serviceId: "a", cents: 1001 }, { serviceId: "b", cents: 2002 }]).total).toBe(1000);
    expect(promoDiscounts({ ...p, kind: "amount", value: 5000 }, [{ serviceId: "a", cents: 2000 }]).perLine).toEqual([2000]);
  });
  it("honors a minimum spend", () => {
    expect(promoDiscounts({ ...p, minSpendCents: 5000 }, [{ serviceId: "a", cents: 4000 }]).problem).toMatch(/at least \$50/);
  });
  it("validates codes the salon creates", () => {
    expect(cleanPromo({ code: "x", kind: "percent", value: 10 })).toMatchObject({ ok: false });
    expect(cleanPromo({ code: "new15", kind: "percent", value: 150 })).toMatchObject({ ok: false });
    expect(cleanPromo({ code: "ten", kind: "amount", value: "10", maxUses: "", perClient: 1, minSpend: "40" })).toMatchObject({ ok: true, row: { code: "TEN", kind: "amount", value: 1000, max_uses: null, min_spend_cents: 4000 } });
  });
});
