import type { Cents } from "../policy/types";

/** Mirrors seed/payment-methods.json. */
export interface PaymentMethod {
  key: string;
  label: string;
  provider: "stripe" | "paypal" | "manual";
  enabled: boolean;
  /** Can be charged later without the client (enforces no-show / late-cancel fees). */
  canGuarantee: boolean;
  /** Venmo username, $Cashtag, PayPal.Me name, or Zelle/Apple Cash phone or email. */
  handle?: string;
}

export interface PaymentRequest {
  method: string;
  label: string;
  /** Tap-to-open link, when the app supports one. */
  url: string | null;
  /** What to show the client when there's no link (Zelle, Apple Cash, cash). */
  instructions: string;
}

const money = (c: Cents) => (c / 100).toFixed(2);
const clean = (h: string) => h.trim().replace(/^[@$]/, "");

/**
 * Build a payment request for a "send it to me" method. Links prefill the
 * amount where the app allows it; the client still confirms in their app.
 */
export function paymentRequest(m: PaymentMethod, amount: Cents, note: string): PaymentRequest {
  if (amount <= 0 || !Number.isInteger(amount)) throw new Error("Amount must be a positive number of cents.");
  const h = m.handle ? clean(m.handle) : "";
  const needHandle = () => {
    if (!h) throw new Error(`Add your ${m.label} handle in Settings > Payments first.`);
  };
  const base = { method: m.key, label: m.label };

  switch (m.key) {
    case "venmo_direct":
      needHandle();
      return { ...base, url: `https://venmo.com/${encodeURIComponent(h)}?txn=pay&amount=${money(amount)}&note=${encodeURIComponent(note)}`, instructions: `Pay $${money(amount)} to @${h} on Venmo.` };
    case "cash_app_direct":
      needHandle();
      return { ...base, url: `https://cash.app/$${encodeURIComponent(h)}/${money(amount)}`, instructions: `Pay $${money(amount)} to $${h} on Cash App.` };
    case "paypal_me":
      needHandle();
      return { ...base, url: `https://paypal.me/${encodeURIComponent(h)}/${money(amount)}USD`, instructions: `Pay $${money(amount)} to paypal.me/${h}.` };
    case "zelle":
      needHandle();
      return { ...base, url: null, instructions: `Send $${money(amount)} with Zelle to ${h}. Include "${note}" in the memo.` };
    case "apple_cash":
      needHandle();
      return { ...base, url: null, instructions: `Send $${money(amount)} with Apple Cash (Messages or Wallet) to ${h}.` };
    case "cash":
      return { ...base, url: null, instructions: `Pay $${money(amount)} in cash at your appointment.` };
    default:
      throw new Error(`${m.label} is paid through checkout, not a payment request.`);
  }
}

export type GuaranteeOutcome =
  /** Card / wallet saved; fees can be charged automatically. */
  | { kind: "saved_method"; payNow: Cents }
  /** No saved method; booking stays "pending" until this amount is received. */
  | { kind: "prepay_to_confirm"; payNow: Cents }
  /** No saved method and nothing due up front; fees become a balance owed. */
  | { kind: "unsecured"; payNow: 0 };

/**
 * How a booking is secured, given how the client will pay and the deposit
 * the policy engine requires.
 */
export function bookingGuarantee(method: PaymentMethod, depositDue: Cents): GuaranteeOutcome {
  if (method.canGuarantee) return { kind: "saved_method", payNow: depositDue };
  if (depositDue > 0) return { kind: "prepay_to_confirm", payNow: depositDue };
  return { kind: "unsecured", payNow: 0 };
}

export const enabledMethods = (all: PaymentMethod[]) => all.filter((m) => m.enabled);
