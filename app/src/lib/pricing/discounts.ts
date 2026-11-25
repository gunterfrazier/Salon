import type { Cents } from "../policy/types";

/** One service on an appointment, before discounts. */
export interface PriceLine {
  serviceKey: string;
  name: string;
  stage: string;
  /** Menu price in cents. */
  basePrice: Cents;
}

export type DiscountValue =
  | { kind: "percent"; value: number }
  /** Dollars off. */
  | { kind: "amount"; value: number }
  /** Set the line to this dollar price. */
  | { kind: "price"; value: number };

/** Mirrors seed/pricing-rules.json. */
export interface BundleRule {
  key: string;
  name: string;
  enabled: boolean;
  trigger: { stages?: string[]; minServices?: number };
  appliesTo: { stages?: string[]; serviceKeys?: string[]; all?: boolean };
  discount: DiscountValue;
}

export type ManualDiscount =
  | { scope: "line"; lineIndex: number; discount: DiscountValue; reason: string }
  | { scope: "appointment"; discount: Exclude<DiscountValue, { kind: "price" }>; reason: string };

export interface Adjustments {
  /** Custom price per line (dollars), replacing the menu price. */
  priceOverrides?: Record<number, number>;
  manual?: ManualDiscount[];
  /** Bundle keys the stylist switched off for this appointment. */
  disabledBundles?: string[];
}

export interface PricedLine extends PriceLine {
  /** Price after any custom override. */
  listPrice: Cents;
  discounts: { source: "bundle" | "manual"; label: string; amount: Cents }[];
  finalPrice: Cents;
}

export interface PricedAppointment {
  lines: PricedLine[];
  subtotal: Cents;
  totalDiscount: Cents;
  total: Cents;
  appliedBundles: string[];
}

const cents = (dollars: number) => Math.round(dollars * 100);

/** Amount to take off `price` (never more than `price`, never negative). */
function amountOff(price: Cents, d: DiscountValue): Cents {
  let off: number;
  switch (d.kind) {
    case "percent":
      if (d.value < 0 || d.value > 100) throw new Error("Percent must be between 0 and 100.");
      off = Math.round((price * d.value) / 100);
      break;
    case "amount":
      if (d.value < 0) throw new Error("Discount can't be negative.");
      off = cents(d.value);
      break;
    case "price":
      if (d.value < 0) throw new Error("Price can't be negative.");
      off = price - cents(d.value);
      break;
  }
  return Math.max(0, Math.min(price, off));
}

function bundleMatches(rule: BundleRule, lines: PriceLine[]): boolean {
  const t = rule.trigger;
  if (t.minServices !== undefined && lines.length < t.minServices) return false;
  if (t.stages && !lines.some((l) => t.stages!.includes(l.stage))) return false;
  return true;
}

function bundleApplies(rule: BundleRule, line: PriceLine): boolean {
  const a = rule.appliesTo;
  return !!(a.all || a.stages?.includes(line.stage) || a.serviceKeys?.includes(line.serviceKey));
}

/**
 * Price a stacked appointment. Order of operations, per line:
 *   custom price → package (bundle) discounts → manual line discounts,
 * then an appointment-wide manual discount is spread across lines in
 * proportion to their price. No line ever goes below $0.
 */
export function priceAppointment(lines: PriceLine[], rules: BundleRule[], adj: Adjustments = {}): PricedAppointment {
  const disabled = new Set(adj.disabledBundles ?? []);
  const active = rules.filter((r) => r.enabled && !disabled.has(r.key) && bundleMatches(r, lines));

  const priced: PricedLine[] = lines.map((l, i) => {
    const override = adj.priceOverrides?.[i];
    if (override !== undefined && override < 0) throw new Error("Price can't be negative.");
    const listPrice = override !== undefined ? cents(override) : l.basePrice;
    return { ...l, listPrice, discounts: [], finalPrice: listPrice };
  });

  for (const rule of active) {
    priced.forEach((l) => {
      if (!bundleApplies(rule, l)) return;
      const off = amountOff(l.finalPrice, rule.discount);
      if (off > 0) {
        l.discounts.push({ source: "bundle", label: rule.name, amount: off });
        l.finalPrice -= off;
      }
    });
  }

  for (const m of adj.manual ?? []) {
    if (m.scope !== "line") continue;
    const l = priced[m.lineIndex];
    if (!l) throw new Error(`No service at position ${m.lineIndex + 1}.`);
    const off = amountOff(l.finalPrice, m.discount);
    if (off > 0) {
      l.discounts.push({ source: "manual", label: m.reason, amount: off });
      l.finalPrice -= off;
    }
  }

  for (const m of adj.manual ?? []) {
    if (m.scope !== "appointment") continue;
    const before = priced.reduce((s, l) => s + l.finalPrice, 0);
    const totalOff = amountOff(before, m.discount);
    let remaining = totalOff;
    // Spread in proportion to each line's price; the last line absorbs rounding.
    const payable = priced.filter((l) => l.finalPrice > 0);
    payable.forEach((l, idx) => {
      const share = idx === payable.length - 1 ? remaining : Math.round((totalOff * l.finalPrice) / before);
      const take = Math.min(share, l.finalPrice, remaining);
      if (take > 0) {
        l.discounts.push({ source: "manual", label: m.reason, amount: take });
        l.finalPrice -= take;
        remaining -= take;
      }
    });
  }

  const subtotal = priced.reduce((s, l) => s + l.listPrice, 0);
  const total = priced.reduce((s, l) => s + l.finalPrice, 0);
  return { lines: priced, subtotal, totalDiscount: subtotal - total, total, appliedBundles: active.map((r) => r.key) };
}
