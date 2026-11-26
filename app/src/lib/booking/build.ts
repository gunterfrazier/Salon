import { depositRequirement, validateDepositAmount, type DepositRequirement } from "../policy/engine";
import type { Cents, ClientPolicyState, PolicySettings } from "../policy/types";
import { priceAppointment, type BundleRule, type PricedAppointment } from "../pricing/discounts";
import { linePrice, planAppointment, type AppointmentPlan, type MenuService } from "../schedule/plan";

export type BookableService = MenuService & { id: string };

/** A row from the services table. */
export interface ServiceRow {
  id: string;
  key: string;
  name: string;
  price_type: MenuService["priceType"];
  price_cents: number;
  estimated_hours: number | null;
  active_min: number;
  processing_min: number;
  finish_min: number;
  deposit_category: MenuService["depositCategory"];
  stage: string;
  includes: string[] | null;
  is_add_on: boolean;
}

export function toBookable(r: ServiceRow): BookableService {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    priceType: r.price_type,
    price: r.price_cents / 100,
    estimatedHours: r.estimated_hours ?? undefined,
    active: r.active_min,
    processing: r.processing_min,
    finish: r.finish_min,
    depositCategory: r.deposit_category,
    stage: r.stage,
    includes: r.includes ?? [],
    isAddOn: r.is_add_on,
  };
}

export interface BookingInput {
  services: BookableService[]; // in the order they'll be done
  start: Date;
  rules: BundleRule[];
  policy: PolicySettings;
  client: ClientPolicyState;
  now: Date;
  /** Stylist's chosen deposit; defaults to the policy's default. */
  depositCents?: Cents;
}

export interface BookingRpcPayload {
  start_at: string;
  end_at: string;
  deposit_required_cents: number;
  services: {
    service_id: string;
    list_price_cents: number;
    discounts: { source: string; label: string; amount_cents: number }[];
    price_quoted_cents: number;
    sort: number;
    busy: { phase: "active" | "finish"; start: string; end: string }[];
  }[];
}

export interface BookingResult {
  plan: AppointmentPlan;
  priced: PricedAppointment;
  deposit: DepositRequirement;
  depositCents: Cents;
  /** Problems that block saving. */
  errors: string[];
  payload: BookingRpcPayload;
}

/** Work out times, prices and deposit for a booking, exactly as it will be saved. */
export function buildBooking(input: BookingInput): BookingResult {
  const { services, start, rules, policy, client, now } = input;
  const plan = planAppointment(start, services);
  const priced = priceAppointment(
    services.map((s) => ({ serviceKey: s.key, name: s.name, stage: s.stage, basePrice: linePrice(s) })),
    rules,
  );
  const deposit = depositRequirement(
    client,
    services.map((s, i) => ({ serviceKey: s.key, depositCategory: s.depositCategory, estimatedPrice: priced.lines[i].finalPrice })),
    policy,
    now,
  );

  const errors: string[] = plan.warnings.filter((w) => w.kind === "add_on_alone").map((w) => w.message);
  if (deposit.blockedByBalance) errors.push("This client has an unpaid balance. Collect it before booking.");

  let depositCents = 0;
  if (deposit.required) {
    depositCents = input.depositCents ?? deposit.defaultAmount;
    const problem = validateDepositAmount(depositCents, deposit);
    if (problem) errors.push(problem);
  }

  const payload: BookingRpcPayload = {
    start_at: plan.start.toISOString(),
    end_at: plan.end.toISOString(),
    deposit_required_cents: depositCents,
    services: services.map((s, i) => ({
      service_id: s.id,
      list_price_cents: priced.lines[i].listPrice,
      discounts: priced.lines[i].discounts.map((d) => ({ source: d.source, label: d.label, amount_cents: d.amount })),
      price_quoted_cents: priced.lines[i].finalPrice,
      sort: i,
      busy: plan.lines[i].segments
        .filter((g) => g.phase !== "processing" || s.allowBookingInProcessing === false)
        .map((g) => ({ phase: g.phase === "finish" ? ("finish" as const) : ("active" as const), start: g.start.toISOString(), end: g.end.toISOString() })),
    })),
  };

  return { plan, priced, deposit, depositCents, errors, payload };
}
