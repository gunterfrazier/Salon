/** Pay for a date range: commission, tips, booth rent. All money in cents. */

export type PayType = "none" | "commission" | "booth_rent";

export interface PayPlan {
  staffId: string;
  name: string;
  payType: PayType;
  servicePct: number;
  retailPct: number;
  rentCents: number;
  rentPeriod: "week" | "month";
  /** Booth renter takes their own payments (salon doesn't pay them out). */
  collectsOwn: boolean;
}

export interface PayInput {
  plans: PayPlan[];
  /** First and last day of the range, inclusive (salon dates). */
  from: string;
  to: string;
  /** Completed visits: service totals by stylist. */
  services: { staffId: string; cents: number }[];
  /** Retail sold with their visits. */
  retail: { staffId: string; cents: number }[];
  /** Tips on their visits (any method, gift cards too). */
  tips: { staffId: string; cents: number }[];
  /** Booth rent received in the range. */
  rentPaid: { staffId: string; cents: number }[];
}

export interface PayLine {
  staffId: string;
  name: string;
  payType: PayType;
  visits: number;
  services: number;
  retail: number;
  tips: number;
  commission: number;
  rentDue: number;
  rentPaid: number;
  /** What the salon owes this person for the range (0 if they collect their own). */
  payout: number;
  /** Rent still owed after payments in the range (never below 0). */
  rentOwed: number;
  note: string;
}

const sumFor = (list: { staffId: string; cents: number }[], id: string) => list.filter((x) => x.staffId === id).reduce((n, x) => n + x.cents, 0);
const countFor = (list: { staffId: string }[], id: string) => list.filter((x) => x.staffId === id).length;

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
const parse = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day, t: Date.UTC(y, m - 1, day) };
};

/** Booth rent for the days in [from, to]: weekly rent per 7 days; monthly rent split by each month's days. */
export function rentForRange(rentCents: number, period: "week" | "month", from: string, to: string): number {
  if (rentCents <= 0 || to < from) return 0;
  const a = parse(from);
  const b = parse(to);
  const days = Math.round((b.t - a.t) / 86_400_000) + 1;
  if (period === "week") return Math.round((rentCents * days) / 7);
  let total = 0;
  let y = a.y;
  let m = a.m;
  for (;;) {
    const dim = daysIn(y, m);
    const start = y === a.y && m === a.m ? a.day : 1;
    const end = y === b.y && m === b.m ? b.day : dim;
    total += (rentCents * (end - start + 1)) / dim;
    if (y === b.y && m === b.m) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return Math.round(total);
}

export function computePay(i: PayInput): PayLine[] {
  return i.plans.map((p) => {
    const services = sumFor(i.services, p.staffId);
    const retail = sumFor(i.retail, p.staffId);
    const tips = sumFor(i.tips, p.staffId);
    const visits = countFor(i.services, p.staffId);
    const rentPaid = sumFor(i.rentPaid, p.staffId);
    const base = { staffId: p.staffId, name: p.name, payType: p.payType, visits, services, retail, tips, rentPaid };
    if (p.payType === "commission") {
      const commission = Math.round((services * p.servicePct) / 100 + (retail * p.retailPct) / 100);
      return { ...base, commission, rentDue: 0, rentOwed: 0, payout: commission + tips, note: `${p.servicePct}% of services${p.retailPct ? `, ${p.retailPct}% of retail` : ""}, plus tips` };
    }
    if (p.payType === "booth_rent") {
      const rentDue = rentForRange(p.rentCents, p.rentPeriod, i.from, i.to);
      if (p.collectsOwn) {
        return { ...base, commission: 0, rentDue, rentOwed: Math.max(0, rentDue - rentPaid), payout: 0, note: "Booth rent; takes their own payments" };
      }
      // The salon collected their clients' money: pass it through, minus rent not yet paid.
      const collected = services + retail + tips;
      const fromPay = Math.min(collected, Math.max(0, rentDue - rentPaid));
      return { ...base, commission: 0, rentDue, rentPaid: rentPaid + fromPay, rentOwed: Math.max(0, rentDue - rentPaid - fromPay), payout: collected - fromPay, note: "Booth rent; the salon collects and pays them out, minus rent" };
    }
    return { ...base, commission: 0, rentDue: 0, rentOwed: 0, payout: 0, note: tips ? "No pay plan; tips shown for reference" : "No pay plan" };
  });
}
