import { describe, expect, it } from "vitest";
import policyJson from "../../../../seed/policies.json";
import {
  activeFlags,
  cancelDefaults,
  depositRequirement,
  dollars,
  flagExpiry,
  resolveCharge,
  validateDepositAmount,
} from "./engine";
import type { BookedService, ClientPolicyState, PolicySettings } from "./types";

const policy = policyJson as unknown as PolicySettings;
const now = new Date("2026-11-25T12:00:00Z");

const color = (price: number): BookedService => ({ serviceKey: "full_balayage", depositCategory: "color", estimatedPrice: dollars(price) });
const cut = (price: number): BookedService => ({ serviceKey: "womens_cut", depositCategory: "standard", estimatedPrice: dollars(price) });

const client = (o: Partial<ClientPolicyState> = {}): ClientPolicyState => ({
  completedVisits: 3,
  flags: [],
  depositOverride: null,
  outstandingBalance: 0,
  ...o,
});

const flag = (type: "late_cancel" | "no_show", daysAgo: number) => {
  const createdAt = new Date(now.getTime() - daysAgo * 86_400_000);
  return { type, createdAt, expiresAt: flagExpiry(createdAt, policy) };
};

describe("deposits", () => {
  it("new client booking color: $50 minimum and default, up to full price", () => {
    const r = depositRequirement(client({ completedVisits: 0 }), [color(230)], policy, now);
    expect(r).toMatchObject({ required: true, reasons: ["new_client"], minimum: 5000, defaultAmount: 5000, maximum: 23000 });
    expect(validateDepositAmount(23000, r)).toBeNull();
    expect(validateDepositAmount(4000, r)).toMatch(/at least \$50/);
    expect(validateDepositAmount(23001, r)).toMatch(/can't exceed/);
  });

  it("new client booking only a haircut: no deposit by default", () => {
    expect(depositRequirement(client({ completedVisits: 0 }), [cut(65)], policy, now).required).toBe(false);
  });

  it("returning client with no flags: no deposit", () => {
    expect(depositRequirement(client(), [color(230)], policy, now).required).toBe(false);
  });

  it("flagged client needs a deposit for any service", () => {
    const r = depositRequirement(client({ flags: [flag("no_show", 10)] }), [cut(65)], policy, now);
    expect(r).toMatchObject({ required: true, reasons: ["flagged_client"], minimum: 5000 });
  });

  it("expired or cleared flags no longer require a deposit", () => {
    const expired = flag("late_cancel", 181);
    const cleared = { ...flag("no_show", 5), clearedAt: now };
    expect(activeFlags([expired, cleared], now)).toHaveLength(0);
    expect(depositRequirement(client({ flags: [expired, cleared] }), [cut(65)], policy, now).required).toBe(false);
  });

  it("deposit never exceeds the services' total", () => {
    const r = depositRequirement(client({ flags: [flag("no_show", 1)] }), [cut(30)], policy, now);
    expect(r.minimum).toBe(3000);
    expect(r.defaultAmount).toBe(3000);
  });

  it("standing 'always full price' override", () => {
    const r = depositRequirement(client({ depositOverride: { kind: "full" } }), [cut(65), color(100)], policy, now);
    expect(r).toMatchObject({ required: true, defaultAmount: 16500, minimum: 16500 });
  });

  it("outstanding balance blocks booking", () => {
    expect(depositRequirement(client({ outstandingBalance: 5000 }), [cut(65)], policy, now).blockedByBalance).toBe(true);
  });
});

describe("cancellations", () => {
  const start = new Date("2026-11-26T15:00:00Z");
  const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);

  it("client cancels online inside 24h: full charge, automatic, flagged", () => {
    const d = cancelDefaults({ by: "client_online" }, start, hoursBefore(5), policy);
    expect(d).toMatchObject({ insideWindow: true, defaultOption: { kind: "full" }, autoCharge: true, flagType: "late_cancel" });
  });

  it("client cancels online with more notice: no charge, deposit refunded, no flag", () => {
    const d = cancelDefaults({ by: "client_online" }, start, hoursBefore(48), policy);
    expect(d).toMatchObject({ insideWindow: false, defaultOption: { kind: "none" }, autoCharge: false, flagType: null, refundDepositIfNoCharge: true });
  });

  it("no-show: stylist is shown the sheet with Full preselected, flagged", () => {
    const d = cancelDefaults({ by: "no_show" }, start, start, policy);
    expect(d).toMatchObject({ defaultOption: { kind: "full" }, promptStylist: true, autoCharge: false, flagType: "no_show" });
  });

  it("stylist cancels for client inside 24h: prompt with Full preselected, flagged", () => {
    const d = cancelDefaults({ by: "stylist", reasonKey: "client_requested" }, start, hoursBefore(3), policy);
    expect(d).toMatchObject({ promptStylist: true, defaultOption: { kind: "full" }, flagType: "late_cancel" });
  });

  it("stylist cancels for client with notice: prompt with No charge preselected", () => {
    const d = cancelDefaults({ by: "stylist", reasonKey: "client_requested" }, start, hoursBefore(30), policy);
    expect(d).toMatchObject({ promptStylist: true, defaultOption: { kind: "none" }, flagType: null });
  });

  it("stylist can't make it: no charge, deposit refunded, never flags", () => {
    const d = cancelDefaults({ by: "stylist", reasonKey: "stylist_unavailable" }, start, hoursBefore(2), policy);
    expect(d).toMatchObject({ defaultOption: { kind: "none" }, flagType: null, refundDepositIfNoCharge: true });
  });
});

describe("charge sheet", () => {
  const full = dollars(230);
  const opts = { refundDepositIfNoCharge: true };

  it("full price minus $50 deposit", () => {
    expect(resolveCharge({ kind: "full" }, full, 5000, opts)).toEqual({ fee: 23000, depositApplied: 5000, chargeCard: 18000, depositRefund: 0, depositRetained: 0 });
  });

  it("percentage", () => {
    expect(resolveCharge({ kind: "percent", percent: 50 }, full, 5000, opts).chargeCard).toBe(6500);
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
