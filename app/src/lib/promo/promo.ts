/** Promo codes: who can use them and how much they take off. Money in cents. */

export interface Promo {
  id: string;
  code: string;
  description: string | null;
  kind: "percent" | "amount";
  /** percent 1-100, or cents off */
  value: number;
  /** null = every service */
  serviceIds: string[] | null;
  newClientsOnly: boolean;
  minSpendCents: number;
  startsOn: string | null;
  endsOn: string | null;
  maxUses: number | null;
  perClient: number;
  active: boolean;
}

export const normalizeCode = (s: unknown) => (typeof s === "string" ? s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) : "");

/** "20% off" / "$10 off" */
export function promoLabel(p: Pick<Promo, "kind" | "value">): string {
  return p.kind === "percent" ? `${p.value}% off` : `$${(p.value / 100).toFixed(p.value % 100 ? 2 : 0)} off`;
}

export interface PromoCheck {
  /** Salon date the visit is on (or today at checkout). */
  date: string;
  newClient: boolean;
  /** Times this client already used it. */
  clientUses: number;
  totalUses: number;
}

/** Can this code be used here? Returns a client-friendly reason when not. */
export function promoProblem(p: Promo, c: PromoCheck): string | null {
  if (!p.active) return "That code isn't active.";
  if (p.startsOn && c.date < p.startsOn) return "That code isn't valid for this date yet.";
  if (p.endsOn && c.date > p.endsOn) return "That code has expired.";
  if (p.maxUses !== null && c.totalUses >= p.maxUses) return "That code has been used up.";
  if (c.clientUses >= p.perClient) return p.perClient === 1 ? "You've already used that code." : "You've used that code as many times as allowed.";
  if (p.newClientsOnly && !c.newClient) return "That code is for new clients.";
  return null;
}

/**
 * Discount per service line. Percent applies to each eligible line; a dollar
 * amount is spread over eligible lines by price. Never more than a line costs.
 */
export function promoDiscounts(p: Promo, lines: { serviceId: string; cents: number }[]): { perLine: number[]; total: number; problem: string | null } {
  const eligible = lines.map((l) => (p.serviceIds === null || p.serviceIds.includes(l.serviceId)) && l.cents > 0);
  const base = lines.reduce((n, l, i) => n + (eligible[i] ? l.cents : 0), 0);
  const zero = { perLine: lines.map(() => 0), total: 0 };
  if (base === 0) return { ...zero, problem: "That code doesn't apply to these services." };
  if (lines.reduce((n, l) => n + l.cents, 0) < p.minSpendCents) return { ...zero, problem: `That code needs a total of at least $${(p.minSpendCents / 100).toFixed(0)}.` };
  let perLine: number[];
  if (p.kind === "percent") {
    perLine = lines.map((l, i) => (eligible[i] ? Math.round((l.cents * p.value) / 100) : 0));
  } else {
    const off = Math.min(p.value, base);
    perLine = lines.map((l, i) => (eligible[i] ? Math.floor((off * l.cents) / base) : 0));
    // Put rounding leftovers on the first eligible line.
    const left = off - perLine.reduce((a, b) => a + b, 0);
    perLine[eligible.indexOf(true)] += left;
  }
  perLine = perLine.map((d, i) => Math.min(d, lines[i].cents));
  return { perLine, total: perLine.reduce((a, b) => a + b, 0), problem: null };
}

/** Validate a code as entered by the salon. */
export function cleanPromo(raw: Partial<Record<string, unknown>>): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const code = normalizeCode(raw.code);
  if (code.length < 3) return { ok: false, error: "Codes are 3 to 20 letters and numbers, e.g. FALL20." };
  const kind = raw.kind === "amount" ? "amount" : "percent";
  const value = kind === "percent" ? Math.round(Number(raw.value)) : Math.round(Number(raw.value) * 100);
  if (!Number.isFinite(value) || value <= 0 || (kind === "percent" && value > 100) || (kind === "amount" && value > 100000)) return { ok: false, error: kind === "percent" ? "Percent off is 1 to 100." : "Enter the dollars off." };
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const startsOn = date(raw.startsOn);
  const endsOn = date(raw.endsOn);
  if (startsOn && endsOn && endsOn < startsOn) return { ok: false, error: "The end date is before the start date." };
  const ids = Array.isArray(raw.serviceIds) ? raw.serviceIds.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)) : [];
  const maxUses = raw.maxUses === "" || raw.maxUses === null || raw.maxUses === undefined ? null : Math.round(Number(raw.maxUses));
  if (maxUses !== null && !(maxUses > 0)) return { ok: false, error: "Total uses should be a number, or empty for unlimited." };
  const perClient = Math.max(1, Math.round(Number(raw.perClient ?? 1)) || 1);
  const minSpend = Math.max(0, Math.round(Number(raw.minSpend ?? 0) * 100) || 0);
  return {
    ok: true,
    row: {
      code,
      description: typeof raw.description === "string" && raw.description.trim() ? raw.description.trim().slice(0, 200) : null,
      kind,
      value,
      service_ids: ids.length ? ids : null,
      new_clients_only: !!raw.newClientsOnly,
      min_spend_cents: minSpend,
      starts_on: startsOn,
      ends_on: endsOn,
      max_uses: maxUses,
      per_client: perClient,
      active: raw.active !== false,
    },
  };
}
