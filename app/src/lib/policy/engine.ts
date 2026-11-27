import { clientStanding } from "./flags";
import type { BookedService, Cents, ClientPolicyState, FlagType, PolicySettings } from "./types";

const HOUR_MS = 60 * 60 * 1000;

export const dollars = (d: number): Cents => Math.round(d * 100);

export function estimatedTotal(services: BookedService[]): Cents {
  return services.reduce((sum, s) => sum + s.estimatedPrice, 0);
}

export function isNewClient(client: ClientPolicyState): boolean {
  return client.onTimeVisits.length + client.priorVisitCount === 0;
}

// ---------------------------------------------------------------------------
// Booking: is a deposit required, and how much?
// ---------------------------------------------------------------------------

export type DepositReason = "new_client" | "flagged_client" | "client_override";

export interface DepositRequirement {
  required: boolean;
  reasons: DepositReason[];
  /** Lowest amount the stylist/booking page may accept. */
  minimum: Cents;
  /** Amount preselected. */
  defaultAmount: Cents;
  /** Highest allowed: full estimated price. */
  maximum: Cents;
  /** Booking blocked until an outstanding balance is paid. */
  blockedByBalance: boolean;
}

export function depositRequirement(
  client: ClientPolicyState,
  services: BookedService[],
  policy: PolicySettings,
  now: Date,
): DepositRequirement {
  const full = estimatedTotal(services);
  const reasons: DepositReason[] = [];
  let minimum = 0;
  let defaultAmount = 0;

  const nc = policy.deposits.newClient;
  if (isNewClient(client)) {
    const triggering = services.filter((s) => nc.enabledFor[s.depositCategory]);
    if (triggering.length > 0) {
      reasons.push("new_client");
      for (const s of triggering) {
        minimum = Math.max(minimum, dollars(nc.minimumAmount[s.depositCategory]));
        defaultAmount = Math.max(defaultAmount, dollars(nc.defaultAmount[s.depositCategory]));
      }
    }
  }

  // Active or permanent flag: the full estimated price of everything booked.
  const fc = policy.deposits.flaggedClient;
  if (fc.enabled && services.length > 0 && clientStanding(client, policy, now).depositRequired) {
    reasons.push("flagged_client");
    minimum = full;
    defaultAmount = full;
  }

  const o = client.depositOverride;
  if (o) {
    reasons.push("client_override");
    const amt = o.kind === "full" ? full : o.amount;
    defaultAmount = Math.max(defaultAmount, amt);
    minimum = Math.max(minimum, amt);
  }

  // Never ask for more than the services cost.
  minimum = Math.min(minimum, full);
  defaultAmount = Math.min(Math.max(defaultAmount, minimum), full);

  return {
    required: reasons.length > 0 && full > 0,
    reasons,
    minimum,
    defaultAmount,
    maximum: full,
    blockedByBalance: client.outstandingBalance > 0,
  };
}

/** Does the salon let team members lower or waive deposits when booking? */
export function staffCanChangeDeposit(policy: PolicySettings): boolean {
  return policy.deposits.staffCanChange !== false;
}

export function validateDepositAmount(amount: Cents, req: DepositRequirement): string | null {
  if (!Number.isInteger(amount)) return "Amount must be whole cents.";
  if (amount < req.minimum) return `Deposit must be at least $${(req.minimum / 100).toFixed(2)}.`;
  if (amount > req.maximum) return `Deposit can't exceed the estimated total of $${(req.maximum / 100).toFixed(2)}.`;
  return null;
}

// ---------------------------------------------------------------------------
// Cancellations & no-shows
// ---------------------------------------------------------------------------

export function isInsideWindow(appointmentStart: Date, cancelledAt: Date, policy: PolicySettings): boolean {
  return appointmentStart.getTime() - cancelledAt.getTime() < policy.lateCancelWindowHours * HOUR_MS;
}

export type ChargeOption =
  | { kind: "none" }
  | { kind: "full" }
  | { kind: "percent"; percent: number }
  | { kind: "custom"; amount: Cents };

export type CancelEvent =
  | { by: "client_online" }
  | { by: "stylist"; reasonKey: string }
  | { by: "no_show" };

export interface CancelDefaults {
  insideWindow: boolean;
  defaultOption: ChargeOption;
  /** Charge without stylist confirmation (client online late cancel). */
  autoCharge: boolean;
  /** Stylist must see the charge sheet. */
  promptStylist: boolean;
  flagType: FlagType | null;
  refundDepositIfNoCharge: boolean;
}

export function cancelDefaults(
  event: CancelEvent,
  appointmentStart: Date,
  at: Date,
  policy: PolicySettings,
): CancelDefaults {
  const insideWindow = event.by === "no_show" ? true : isInsideWindow(appointmentStart, at, policy);
  const flagOn = (t: FlagType) => (policy.flags.createOn.includes(t) ? t : null);

  if (event.by === "no_show") {
    return {
      insideWindow,
      defaultOption: { kind: policy.fees.noShow.defaultCharge },
      autoCharge: policy.fees.noShow.autoCharge,
      promptStylist: !policy.fees.noShow.autoCharge,
      flagType: flagOn("no_show"),
      refundDepositIfNoCharge: false,
    };
  }

  if (event.by === "client_online") {
    return {
      insideWindow,
      defaultOption: insideWindow ? { kind: policy.fees.lateCancel.defaultCharge } : { kind: "none" },
      autoCharge: insideWindow && policy.fees.lateCancel.autoCharge,
      promptStylist: false,
      flagType: insideWindow ? flagOn("late_cancel") : null,
      refundDepositIfNoCharge: !insideWindow && policy.deposits.refundIfCancelledOutsideWindow,
    };
  }

  const reason = policy.stylistInitiatedCancel.reasons.find((r) => r.key === event.reasonKey);
  if (!reason) throw new Error(`Unknown cancel reason: ${event.reasonKey}`);
  const clientCaused = reason.defaultCharge === "full_if_inside_window_else_none";
  const def =
    reason.defaultCharge === "full" || (clientCaused && insideWindow) ? "full" : "none";

  return {
    insideWindow,
    defaultOption: { kind: def },
    autoCharge: false,
    promptStylist: policy.stylistInitiatedCancel.promptForCharge,
    flagType: clientCaused && insideWindow ? flagOn("late_cancel") : null,
    refundDepositIfNoCharge:
      reason.refundDeposit === true ||
      (!insideWindow && policy.deposits.refundIfCancelledOutsideWindow),
  };
}

export interface ChargeBreakdown {
  /** Total fee owed for the cancellation / no-show. */
  fee: Cents;
  /** Portion of the fee covered by the deposit already collected. */
  depositApplied: Cents;
  /** Amount to charge to the card on file now. */
  chargeCard: Cents;
  /** Deposit returned to the client. */
  depositRefund: Cents;
  /** Deposit kept with no fee charged (refund setting off). */
  depositRetained: Cents;
}

/**
 * Resolve the stylist's choice on the charge sheet into money movements.
 * The fee is capped at the full estimated price; invalid inputs throw.
 * Any deposit already collected counts toward the fee first; deposit beyond
 * the fee is refunded. With no fee, the deposit is refunded or kept per policy.
 */
export function resolveCharge(
  option: ChargeOption,
  fullPrice: Cents,
  depositCollected: Cents,
  opts: { refundDepositIfNoCharge: boolean },
): ChargeBreakdown {
  let fee: Cents;
  switch (option.kind) {
    case "none":
      fee = 0;
      break;
    case "full":
      fee = fullPrice;
      break;
    case "percent":
      if (!(option.percent >= 0 && option.percent <= 100)) throw new Error("Percent must be between 0 and 100.");
      fee = Math.round((fullPrice * option.percent) / 100);
      break;
    case "custom":
      if (!Number.isInteger(option.amount) || option.amount < 0) throw new Error("Amount must be a positive whole number of cents.");
      if (option.amount > fullPrice) throw new Error("Amount can't exceed the full service price.");
      fee = option.amount;
      break;
  }

  if (fee === 0) {
    return opts.refundDepositIfNoCharge
      ? { fee: 0, depositApplied: 0, chargeCard: 0, depositRefund: depositCollected, depositRetained: 0 }
      : { fee: 0, depositApplied: 0, chargeCard: 0, depositRefund: 0, depositRetained: depositCollected };
  }

  const depositApplied = Math.min(fee, depositCollected);
  return {
    fee,
    depositApplied,
    chargeCard: fee - depositApplied,
    depositRefund: depositCollected - depositApplied,
    depositRetained: 0,
  };
}

export function percentPreview(fullPrice: Cents, percent: number): Cents {
  return Math.round((fullPrice * percent) / 100);
}
