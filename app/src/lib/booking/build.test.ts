import { describe, expect, it } from "vitest";
import policyJson from "../../../seed/policies.json";
import rulesJson from "../../../seed/pricing-rules.json";
import { servicesByKey } from "../menu";
import type { ClientPolicyState, PolicySettings } from "../policy/types";
import type { BundleRule } from "../pricing/discounts";
import { buildBooking, type BookableService } from "./build";

const policy = policyJson as unknown as PolicySettings;
const rules = rulesJson.bundles as BundleRule[];
const svc = (key: string): BookableService => ({ ...servicesByKey[key], id: `id-${key}` });
const now = new Date("2026-11-26T12:00:00Z");
const start = new Date("2026-12-01T21:30:00Z"); // Tue 3:30 PM Central

const regular: ClientPolicyState = { onTimeVisits: [], priorVisitCount: 6, flags: [], depositOverride: null, outstandingBalance: 0 };
const newClient: ClientPolicyState = { ...regular, priorVisitCount: 0 };

describe("buildBooking", () => {
  it("stacks color + cut + style with the 5% package and busy blocks", () => {
    const r = buildBooking({ services: [svc("full_highlights"), svc("womens_cut"), svc("style")], start, rules, policy, client: regular, now });
    expect(r.errors).toEqual([]);
    expect(r.plan.totalMinutes).toBe(125 + 45 + 45);
    expect(r.priced.total).toBe(Math.round(18500 * 0.95));
    expect(r.deposit.required).toBe(false);
    const hl = r.payload.services[0];
    expect(hl.list_price_cents).toBe(12500);
    expect(hl.price_quoted_cents).toBe(12500 - 625);
    expect(hl.discounts[0]).toMatchObject({ source: "bundle", amount_cents: 625 });
    // Highlights: 75 min hands-on, 35 processing (open), 15 finish
    expect(hl.busy).toEqual([
      { phase: "active", start: "2026-12-01T21:30:00.000Z", end: "2026-12-01T22:45:00.000Z" },
      { phase: "finish", start: "2026-12-01T23:20:00.000Z", end: "2026-12-01T23:35:00.000Z" },
    ]);
    expect(r.payload.end_at).toBe(new Date(start.getTime() + 215 * 60000).toISOString());
  });

  it("new client: $50 default deposit, adjustable up to the total", () => {
    const base = { services: [svc("balayage")], start, rules, policy, client: newClient, now };
    expect(buildBooking(base)).toMatchObject({ depositCents: 5000, errors: [] });
    expect(buildBooking({ ...base, depositCents: 9500 })).toMatchObject({ depositCents: 9500, errors: [] });
    expect(buildBooking({ ...base, depositCents: 2000 }).errors[0]).toMatch(/at least \$50/);
  });

  it("$20 men's cut for a new client asks no more than $20", () => {
    expect(buildBooking({ services: [svc("mens_boys_cut")], start, rules, policy, client: newClient, now }).depositCents).toBe(2000);
  });

  it("flagged client pays the full discounted total", () => {
    const flagged: ClientPolicyState = {
      ...regular,
      flags: [{ id: "f", type: "no_show", createdAt: now, appointmentStart: now, permanent: false }],
    };
    const r = buildBooking({ services: [svc("all_over_color"), svc("womens_cut")], start, rules, policy, client: flagged, now });
    expect(r.depositCents).toBe(r.priced.total);
  });

  it("blocks booking with an unpaid balance or an add-on alone", () => {
    expect(buildBooking({ services: [svc("womens_cut")], start, rules, policy, client: { ...regular, outstandingBalance: 1000 }, now }).errors[0]).toMatch(/unpaid balance/);
    expect(buildBooking({ services: [svc("travel_fee")], start, rules, policy, client: regular, now }).errors[0]).toMatch(/Add-ons/);
  });
});
