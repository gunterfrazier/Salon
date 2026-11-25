import { describe, expect, it } from "vitest";
import policyJson from "../../../seed/policies.json";
import { cancelDefaults, depositRequirement, dollars, resolveCharge, validateDepositAmount } from "./engine";
import { bookingAlert, clientStanding, flagStatus } from "./flags";
import type { BookedService, ClientFlag, ClientPolicyState, PolicySettings } from "./types";

const policy = policyJson as unknown as PolicySettings;
const now = new Date("2026-11-25T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

const color = (price: number): BookedService => ({ serviceKey: "full_highlights", depositCategory: "color", estimatedPrice: dollars(price) });
const cut = (price: number): BookedService => ({ serviceKey: "womens_cut", depositCategory: "standard", estimatedPrice: dollars(price) });

const client = (o: Partial<ClientPolicyState> = {}): ClientPolicyState => ({
  onTimeVisits: [],
  priorVisitCount: 5,
  flags: [],
  depositOverride: null,
  outstandingBalance: 0,
  ...o,
});

const flag = (type: ClientFlag["type"], daysBack: number, o: Partial<ClientFlag> = {}): ClientFlag => ({
  id: `${type}-${daysBack}`,
  type,
  createdAt: daysAgo(daysBack),
  appointmentStart: daysAgo(daysBack),
  permanent: false,
  ...o,
});

describe("new-client deposits", () => {
  const newClient = client({ priorVisitCount: 0 });

  it("color: $50 minimum and default, up to full price", () => {
    const r = depositRequirement(newClient, [color(125)], policy, now);
    expect(r).toMatchObject({ required: true, reasons: ["new_client"], minimum: 5000, defaultAmount: 5000, maximum: 12500 });
    expect(validateDepositAmount(12500, r)).toBeNull();
    expect(validateDepositAmount(4000, r)).toMatch(/at least \$50/);
    expect(validateDepositAmount(12501, r)).toMatch(/can't exceed/);
  });

  it("any service can require a deposit, capped at its price ($30 cut → max $30)", () => {
    const r = depositRequirement(newClient, [cut(30)], policy, now);
    expect(r).toMatchObject({ required: true, defaultAmount: 3000, maximum: 3000 });
  });

  it("turning a category off removes its deposit", () => {
    const off = structuredClone(policy);
    off.deposits.newClient.enabledFor.standard = false;
    expect(depositRequirement(newClient, [cut(30)], off, now).required).toBe(false);
  });

  it("stacked services: capped at the combined total", () => {
    const r = depositRequirement(newClient, [cut(20), cut(15)], policy, now);
    expect(r).toMatchObject({ defaultAmount: 3500, maximum: 3500 });
  });

  it("imported StyleSeat regulars are not new clients", () => {
    expect(depositRequirement(client({ priorVisitCount: 12 }), [color(125)], policy, now).required).toBe(false);
  });
});

describe("flags", () => {
  it("flag stays active until 4 on-time visits, then clears", () => {
    const f = flag("no_show", 100);
    const visits = (n: number) => Array.from({ length: n }, (_, i) => daysAgo(90 - i * 10));
    expect(flagStatus(f, client({ onTimeVisits: visits(3) }), policy, now)).toMatchObject({ state: "active", visitsRemaining: 1 });
    expect(flagStatus(f, client({ onTimeVisits: visits(4) }), policy, now)).toMatchObject({ state: "resolved", resolvedBy: "visits" });
  });

  it("visits before the violation don't count", () => {
    const f = flag("late_cancel", 30);
    const s = flagStatus(f, client({ onTimeVisits: [daysAgo(60), daysAgo(50), daysAgo(40), daysAgo(35)] }), policy, now);
    expect(s).toMatchObject({ state: "active", visitsRemaining: 4 });
  });

  it("the visit count is customizable", () => {
    const two = structuredClone(policy);
    two.flags.clearAfterOnTimeVisits = 2;
    const s = flagStatus(flag("no_show", 30), client({ onTimeVisits: [daysAgo(20), daysAgo(10)] }), two, now);
    expect(s.state).toBe("resolved");
  });

  it("permanent flags never clear", () => {
    const visits = Array.from({ length: 10 }, (_, i) => daysAgo(i + 1));
    const s = flagStatus(flag("no_show", 30, { permanent: true }), client({ onTimeVisits: visits }), policy, now);
    expect(s.state).toBe("permanent");
  });

  it("standing: permanent > active > history > clear", () => {
    expect(clientStanding(client(), policy, now).standing).toBe("clear");
    expect(clientStanding(client({ flags: [flag("no_show", 5, { clearedAt: now, clearNote: "ok" })] }), policy, now).standing).toBe("history");
    expect(clientStanding(client({ flags: [flag("no_show", 5)] }), policy, now).standing).toBe("active");
    expect(clientStanding(client({ flags: [flag("no_show", 5), flag("late_cancel", 50, { permanent: true })] }), policy, now).standing).toBe("permanent");
  });
});

describe("flagged-client deposits", () => {
  it("active flag: full price of all booked services", () => {
    const r = depositRequirement(client({ flags: [flag("no_show", 10)] }), [color(125), cut(20)], policy, now);
    expect(r).toMatchObject({ required: true, reasons: ["flagged_client"], minimum: 14500, defaultAmount: 14500, maximum: 14500 });
  });

  it("permanent flag: full price", () => {
    const r = depositRequirement(client({ flags: [flag("late_cancel", 400, { permanent: true })] }), [cut(35)], policy, now);
    expect(r).toMatchObject({ required: true, minimum: 3500 });
  });

  it("past (cleared) violation: no deposit", () => {
    const visits = [daysAgo(40), daysAgo(30), daysAgo(20), daysAgo(10)];
    expect(depositRequirement(client({ onTimeVisits: visits, flags: [flag("no_show", 50)] }), [cut(35)], policy, now).required).toBe(false);
  });

  it("outstanding balance blocks booking", () => {
    expect(depositRequirement(client({ outstandingBalance: 5000 }), [cut(35)], policy, now).blockedByBalance).toBe(true);
  });
});

describe("booking alerts", () => {
  it("no alert for clients who were never flagged", () => {
    expect(bookingAlert("Ana", client(), policy, now)).toBeNull();
  });

  it("past violation still warns, with history", () => {
    const visits = [daysAgo(40), daysAgo(30), daysAgo(20), daysAgo(10)];
    const a = bookingAlert("Ana", client({ onTimeVisits: visits, flags: [flag("no_show", 50)] }), policy, now)!;
    expect(a.standing).toBe("history");
    expect(a.title).toBe("Ana was flagged in the past");
    expect(a.message).toMatch(/1 no-show/);
    expect(a.history).toHaveLength(1);
  });

  it("active flag says how many visits are left", () => {
    const a = bookingAlert("Ana", client({ flags: [flag("late_cancel", 20)] }), policy, now)!;
    expect(a.standing).toBe("active");
    expect(a.message).toMatch(/Full payment required/);
    expect(a.message).toMatch(/4 more on-time visits/);
  });
});

describe("cancellations", () => {
  const start = new Date("2026-11-26T15:00:00Z");
  const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);

  it("client cancels online inside 24h: full charge, automatic by default, flagged", () => {
    const d = cancelDefaults({ by: "client_online" }, start, hoursBefore(5), policy);
    expect(d).toMatchObject({ insideWindow: true, defaultOption: { kind: "full" }, autoCharge: true, flagType: "late_cancel" });
  });

  it("approval mode: late-cancel charge waits for the stylist", () => {
    const manual = structuredClone(policy);
    manual.fees.lateCancel.autoCharge = false;
    expect(cancelDefaults({ by: "client_online" }, start, hoursBefore(5), manual).autoCharge).toBe(false);
  });

  it("client cancels online with more notice: no charge, deposit refunded, no flag", () => {
    const d = cancelDefaults({ by: "client_online" }, start, hoursBefore(48), policy);
    expect(d).toMatchObject({ insideWindow: false, defaultOption: { kind: "none" }, flagType: null, refundDepositIfNoCharge: true });
  });

  it("no-show: sheet opens with Full preselected, flagged", () => {
    const d = cancelDefaults({ by: "no_show" }, start, start, policy);
    expect(d).toMatchObject({ defaultOption: { kind: "full" }, promptStylist: true, flagType: "no_show" });
  });

  it("stylist cancels for client inside 24h: prompt with Full preselected, flagged", () => {
    const d = cancelDefaults({ by: "stylist", reasonKey: "client_requested" }, start, hoursBefore(3), policy);
    expect(d).toMatchObject({ promptStylist: true, defaultOption: { kind: "full" }, flagType: "late_cancel" });
  });

  it("stylist can't make it: no charge, deposit refunded, never flags", () => {
    const d = cancelDefaults({ by: "stylist", reasonKey: "stylist_unavailable" }, start, hoursBefore(2), policy);
    expect(d).toMatchObject({ defaultOption: { kind: "none" }, flagType: null, refundDepositIfNoCharge: true });
  });
});

describe("charge sheet", () => {
  const full = dollars(125);
  const opts = { refundDepositIfNoCharge: true };

  it("full price minus deposit", () => {
    expect(resolveCharge({ kind: "full" }, full, 5000, opts)).toEqual({ fee: 12500, depositApplied: 5000, chargeCard: 7500, depositRefund: 0, depositRetained: 0 });
  });

  it("percentage", () => {
    expect(resolveCharge({ kind: "percent", percent: 50 }, full, 5000, opts).chargeCard).toBe(1250);
  });

  it("custom amount smaller than deposit refunds the difference", () => {
    expect(resolveCharge({ kind: "custom", amount: 2000 }, full, 5000, opts)).toMatchObject({ chargeCard: 0, depositApplied: 2000, depositRefund: 3000 });
  });

  it("custom amount above full price is rejected", () => {
    expect(() => resolveCharge({ kind: "custom", amount: full + 1 }, full, 0, opts)).toThrow(/exceed/);
  });

  it("no charge refunds or keeps the deposit per policy", () => {
    expect(resolveCharge({ kind: "none" }, full, 5000, opts).depositRefund).toBe(5000);
    expect(resolveCharge({ kind: "none" }, full, 5000, { refundDepositIfNoCharge: false }).depositRetained).toBe(5000);
  });
});
