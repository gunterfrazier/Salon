import { resolveCharge, type ChargeOption } from "../policy/engine";
import type { Cents } from "../policy/types";

/**
 * Money movements when an appointment is cancelled or marked no-show.
 * There are no saved cards yet, so whatever the client owes beyond their
 * deposit is either collected now (cash, Venmo, Zelle…) or added to their
 * balance, which blocks their next booking until paid.
 */
export interface CancelSettlement {
  fee: Cents;
  /** Deposit already paid that counts toward the fee. */
  depositApplied: Cents;
  /** Collected now with a payment method. */
  collectNow: Cents;
  /** Added to the client's balance. */
  balance: Cents;
  /** Deposit to give back to the client. */
  refund: Cents;
}

export function settleCancel(
  option: ChargeOption,
  fullPrice: Cents,
  depositPaid: Cents,
  opts: { refundDepositIfNoCharge: boolean; collectNow: boolean },
): CancelSettlement {
  const r = resolveCharge(option, fullPrice, depositPaid, { refundDepositIfNoCharge: opts.refundDepositIfNoCharge });
  return {
    fee: r.fee,
    depositApplied: r.depositApplied,
    collectNow: opts.collectNow ? r.chargeCard : 0,
    balance: opts.collectNow ? 0 : r.chargeCard,
    refund: r.depositRefund,
  };
}

export interface CheckoutInput {
  /** Final price per service (stylist may adjust "starting at" prices). */
  prices: Cents[];
  /** Retail products sold with the visit. */
  retail?: Cents;
  tip: Cents;
  depositPaid: Cents;
  /** Amount the client pays now. */
  paid: Cents;
}

export interface CheckoutTotals {
  services: Cents;
  retail: Cents;
  tip: Cents;
  total: Cents;
  depositApplied: Cents;
  /** Total minus deposit. */
  due: Cents;
  paid: Cents;
  /** Unpaid remainder, added to the client's balance. */
  balance: Cents;
  /** Of the amount paid now, how much is the tip, and how much retail (the rest is services). */
  tipPaid: Cents;
  retailPaid: Cents;
  /** Deposit larger than the bill, owed back to the client. */
  refund: Cents;
}

export function checkoutTotals(i: CheckoutInput): CheckoutTotals {
  const retail = i.retail ?? 0;
  const bad = [...i.prices, retail, i.tip, i.depositPaid, i.paid].find((n) => !Number.isInteger(n) || n < 0);
  if (bad !== undefined) throw new Error("Amounts must be zero or more.");
  const services = i.prices.reduce((a, b) => a + b, 0);
  const total = services + retail + i.tip;
  const depositApplied = Math.min(i.depositPaid, total);
  const due = total - depositApplied;
  if (i.paid > due) throw new Error(`Payment is more than the $${(due / 100).toFixed(2)} due.`);
  // The deposit covers services first, then retail, then the tip.
  const depLeftAfterServices = Math.max(0, depositApplied - services);
  const retailDue = retail - Math.min(depLeftAfterServices, retail);
  const tipDue = i.tip - Math.min(Math.max(0, depLeftAfterServices - retail), i.tip);
  // Today's payment goes to the tip first, then retail, then services.
  const tipPaid = Math.min(tipDue, i.paid);
  const retailPaid = Math.min(retailDue, i.paid - tipPaid);
  return {
    services,
    retail,
    tip: i.tip,
    total,
    depositApplied,
    due,
    paid: i.paid,
    balance: due - i.paid,
    tipPaid,
    retailPaid,
    refund: i.depositPaid - depositApplied,
  };
}

/** Tip presets as amounts, on the services total. */
export const tipPresets = (services: Cents, percents = [15, 20, 25]) => percents.map((p) => ({ percent: p, amount: Math.round((services * p) / 100) }));
