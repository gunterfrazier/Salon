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
  tip: Cents;
  depositPaid: Cents;
  /** Amount the client pays now. */
  paid: Cents;
}

export interface CheckoutTotals {
  services: Cents;
  tip: Cents;
  total: Cents;
  depositApplied: Cents;
  /** Total minus deposit. */
  due: Cents;
  paid: Cents;
  /** Unpaid remainder, added to the client's balance. */
  balance: Cents;
  /** Of the amount paid now, how much is the tip (rest is services). */
  tipPaid: Cents;
  /** Deposit larger than the bill, owed back to the client. */
  refund: Cents;
}

export function checkoutTotals(i: CheckoutInput): CheckoutTotals {
  const bad = [...i.prices, i.tip, i.depositPaid, i.paid].find((n) => !Number.isInteger(n) || n < 0);
  if (bad !== undefined) throw new Error("Amounts must be zero or more.");
  const services = i.prices.reduce((a, b) => a + b, 0);
  const total = services + i.tip;
  const depositApplied = Math.min(i.depositPaid, total);
  const due = total - depositApplied;
  if (i.paid > due) throw new Error(`Payment is more than the $${(due / 100).toFixed(2)} due.`);
  // Deposit covers services first, so any tip is paid from today's payment.
  const tipFromDeposit = Math.max(0, depositApplied - services);
  const tipPaid = Math.min(i.tip - tipFromDeposit, i.paid);
  return {
    services,
    tip: i.tip,
    total,
    depositApplied,
    due,
    paid: i.paid,
    balance: due - i.paid,
    tipPaid,
    refund: i.depositPaid - depositApplied,
  };
}

/** Tip presets as amounts, on the services total. */
export const tipPresets = (services: Cents, percents = [15, 20, 25]) => percents.map((p) => ({ percent: p, amount: Math.round((services * p) / 100) }));
