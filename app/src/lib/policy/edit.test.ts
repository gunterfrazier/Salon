import { describe, expect, it } from "vitest";
import policyJson from "../../../seed/policies.json";
import { applyForm, toForm } from "./edit";
import { policyText } from "./text";
import { depositRequirement, dollars } from "./engine";
import type { PolicySettings } from "./types";

const policy = policyJson as unknown as PolicySettings;

describe("editing the policy", () => {
  it("round-trips the defaults unchanged", () => {
    const r = applyForm(policy, toForm(policy));
    expect(r.ok && r.policy.deposits.newClient).toEqual(policy.deposits.newClient);
    expect(r.ok && r.policy.stylistInitiatedCancel).toEqual(policy.stylistInitiatedCancel);
  });

  it("changes deposits, notice and fees, and they take effect", () => {
    const f = toForm(policy);
    const r = applyForm(policy, { ...f, lateCancelWindowHours: 48, colorDeposit: { on: true, amount: 75, minimum: 25 }, standardDeposit: { on: false, amount: 20, minimum: 0 }, noShowFee: "none", clearAfterVisits: null });
    if (!r.ok) throw new Error(r.error);
    expect(r.policy.lateCancelWindowHours).toBe(48);
    expect(r.policy.fees.noShow.defaultCharge).toBe("none");
    expect(r.policy.flags.clearAfterOnTimeVisits).toBeNull();
    const newClient = { onTimeVisits: [], priorVisitCount: 0, flags: [], depositOverride: null, outstandingBalance: 0 };
    const now = new Date("2026-12-01T12:00:00Z");
    expect(depositRequirement(newClient, [{ serviceKey: "balayage", depositCategory: "color", estimatedPrice: dollars(150) }], r.policy, now)).toMatchObject({ required: true, defaultAmount: 7500, minimum: 2500 });
    expect(depositRequirement(newClient, [{ serviceKey: "womens_cut", depositCategory: "standard", estimatedPrice: dollars(35) }], r.policy, now).required).toBe(false);
  });

  it("names both deposit amounts when they differ", () => {
    const r = applyForm(policy, { ...toForm(policy), colorDeposit: { on: true, amount: 75, minimum: 50 } });
    if (!r.ok) throw new Error(r.error);
    expect(policyText(r.policy)[0]).toBe("New clients pay a deposit to book: $75 for color services, $50 for other services (never more than the service total).");
    expect(policyText(policy)[0]).toMatch(/^New clients pay a \$50 deposit to book any service/);
  });

  it("refuses nonsense", () => {
    const f = toForm(policy);
    expect(applyForm(policy, { ...f, lateCancelWindowHours: -1 })).toMatchObject({ ok: false });
    expect(applyForm(policy, { ...f, colorDeposit: { on: true, amount: 20, minimum: 50 } })).toMatchObject({ ok: false });
    expect(applyForm(policy, { ...f, standardDeposit: { on: true, amount: 0, minimum: 0 } })).toMatchObject({ ok: false });
    expect(applyForm(policy, { ...f, clearAfterVisits: 0 })).toMatchObject({ ok: false });
  });
});
