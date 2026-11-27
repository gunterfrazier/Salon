/** Loyalty punch card and referral rewards. Money in cents. */

export interface RewardValue {
  kind: "percent" | "amount";
  /** percent 1-100, or cents */
  value: number;
}

export interface LoyaltySettings {
  card: { enabled: boolean; visits: number; reward: RewardValue };
  referral: { enabled: boolean; friend: RewardValue; referrer: RewardValue };
  /** Rewards expire this many months after they're earned (null = never). */
  expireMonths: number | null;
}

export const DEFAULT_LOYALTY: LoyaltySettings = {
  card: { enabled: false, visits: 10, reward: { kind: "amount", value: 1500 } },
  referral: { enabled: false, friend: { kind: "amount", value: 1000 }, referrer: { kind: "amount", value: 1000 } },
  expireMonths: 12,
};

const reward = (r: unknown, d: RewardValue): RewardValue => {
  const o = (r ?? {}) as Partial<RewardValue>;
  const kind = o.kind === "percent" ? "percent" : o.kind === "amount" ? "amount" : d.kind;
  const v = Math.round(Number(o.value));
  const ok = Number.isFinite(v) && v > 0 && (kind === "percent" ? v <= 100 : v <= 100000);
  return { kind, value: ok ? v : d.value };
};

/** Stored settings merged over the defaults, with every value checked. */
export function loyaltySettings(stored: unknown): LoyaltySettings {
  const s = (stored ?? {}) as { card?: Partial<LoyaltySettings["card"]>; referral?: Partial<LoyaltySettings["referral"]>; expireMonths?: unknown };
  const visits = Math.round(Number(s.card?.visits));
  const months = s.expireMonths === null ? null : Math.round(Number(s.expireMonths ?? DEFAULT_LOYALTY.expireMonths));
  return {
    card: { enabled: !!s.card?.enabled, visits: visits >= 2 && visits <= 50 ? visits : DEFAULT_LOYALTY.card.visits, reward: reward(s.card?.reward, DEFAULT_LOYALTY.card.reward) },
    referral: { enabled: !!s.referral?.enabled, friend: reward(s.referral?.friend, DEFAULT_LOYALTY.referral.friend), referrer: reward(s.referral?.referrer, DEFAULT_LOYALTY.referral.referrer) },
    expireMonths: months === null ? null : months >= 1 && months <= 60 ? months : DEFAULT_LOYALTY.expireMonths,
  };
}

export const rewardLabel = (r: RewardValue) => (r.kind === "percent" ? `${r.value}% off` : `$${(r.value / 100).toFixed(r.value % 100 ? 2 : 0)} off`);

/** Where a client is on the punch card after `completed` paid visits. */
export function punchCard(completed: number, visits: number): { filled: number; toGo: number } {
  const filled = completed % visits;
  return { filled, toGo: visits - filled };
}

/** Did this visit complete a card? (The Nth, 2Nth… paid visit earns a reward.) */
export const earnsCardReward = (completedIncludingThis: number, visits: number) => completedIncludingThis > 0 && completedIncludingThis % visits === 0;

/** Short referral code like "JAMIE7K2": first name plus 3 characters. */
export function referralCode(firstName: string, rand: () => number = Math.random): string {
  const name = firstName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "FRIEND";
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 3; i++) tail += chars[Math.floor(rand() * chars.length)];
  return `${name}${tail}`;
}

/** Date a reward earned today expires (salon date), or null. */
export function expiresOn(today: string, months: number | null): string | null {
  if (months === null) return null;
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, d));
  return t.toISOString().slice(0, 10);
}
