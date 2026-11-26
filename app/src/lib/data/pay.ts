import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computePay, type PayLine, type PayPlan } from "../pay/compute";
import { rangeFor } from "../reports/build";
import { addDays, isDateStr, zonedToUtc } from "../time/zone";

export type PayRangeKey = "week" | "last_week" | "month" | "last_month" | "custom";

export function payRange(sp: { range?: string; from?: string; to?: string }, today: string): { key: PayRangeKey; from: string; to: string } {
  const key = (["week", "last_week", "month", "last_month", "custom"] as const).find((k) => k === sp.range) ?? (sp.from && sp.to ? "custom" : "week");
  if (key === "last_week") return { key, ...rangeFor("week", addDays(today, -7)) };
  if (key === "custom") {
    if (isDateStr(sp.from) && isDateStr(sp.to) && sp.from <= sp.to && (Date.parse(sp.to) - Date.parse(sp.from)) / 86_400_000 <= 400) return { key, from: sp.from, to: sp.to };
    return { key: "week", ...rangeFor("week", today) };
  }
  return { key, ...rangeFor(key, today) };
}

export interface PayData {
  lines: PayLine[];
  plans: PayPlan[];
  rent: { id: string; staffId: string; cents: number; method: string; paidOn: string; note: string | null }[];
}

export const PLAN_COLS = "id,display_name,role,active,pay_type,service_commission_pct,retail_commission_pct,booth_rent_cents,booth_rent_period,booth_collects_own";

type StaffRow = { id: string; display_name: string; role: string; active: boolean; pay_type: PayPlan["payType"]; service_commission_pct: number; retail_commission_pct: number; booth_rent_cents: number; booth_rent_period: "week" | "month"; booth_collects_own: boolean };

export const toPlan = (s: StaffRow): PayPlan => ({
  staffId: s.id,
  name: s.display_name,
  payType: s.pay_type,
  servicePct: Number(s.service_commission_pct),
  retailPct: Number(s.retail_commission_pct),
  rentCents: s.booth_rent_cents,
  rentPeriod: s.booth_rent_period,
  collectsOwn: s.booth_collects_own,
});

/** Everything the Pay page needs for [from, to] (salon dates), optionally for one person only. */
export async function loadPay(db: SupabaseClient, businessId: string, tz: string, from: string, to: string, onlyStaff?: string): Promise<PayData> {
  const start = zonedToUtc(from, 0, tz).toISOString();
  const end = zonedToUtc(addDays(to, 1), 0, tz).toISOString();
  let sq = db.from("staff").select(PLAN_COLS).eq("business_id", businessId).order("created_at");
  if (onlyStaff) sq = sq.eq("id", onlyStaff);
  const { data: staff } = await sq;
  const plans = ((staff ?? []) as StaffRow[]).filter((s) => s.active || s.id === onlyStaff).map(toPlan);

  // Completed visits in the range (by start time), with their service totals.
  const appts: { id: string; staff_id: string; appointment_services: { price_quoted_cents: number }[] }[] = [];
  for (let off = 0; ; off += 1000) {
    let q = db.from("appointments").select("id,staff_id,appointment_services(price_quoted_cents)").eq("business_id", businessId).eq("status", "completed").gte("start_at", start).lt("start_at", end).range(off, off + 999);
    if (onlyStaff) q = q.eq("staff_id", onlyStaff);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    appts.push(...((data ?? []) as typeof appts));
    if (!data || data.length < 1000) break;
  }
  const staffOf = new Map(appts.map((a) => [a.id, a.staff_id]));
  const ids = appts.map((a) => a.id);
  const retail: { staffId: string; cents: number }[] = [];
  const tips: { staffId: string; cents: number }[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const [{ data: items }, { data: pays }] = await Promise.all([
      db.from("sale_items").select("appointment_id,qty,price_cents").in("appointment_id", chunk),
      db.from("payments").select("appointment_id,amount_cents").eq("kind", "tip").eq("status", "succeeded").in("appointment_id", chunk),
    ]);
    for (const it of items ?? []) retail.push({ staffId: staffOf.get(it.appointment_id)!, cents: Math.round(Number(it.qty) * it.price_cents) });
    for (const p of pays ?? []) tips.push({ staffId: staffOf.get(p.appointment_id)!, cents: p.amount_cents });
  }
  let rq = db.from("booth_rent_payments").select("id,staff_id,amount_cents,method,paid_on,note").eq("business_id", businessId).gte("paid_on", from).lte("paid_on", to).order("paid_on");
  if (onlyStaff) rq = rq.eq("staff_id", onlyStaff);
  const { data: rentRows } = await rq;
  const rent = (rentRows ?? []).map((r) => ({ id: r.id, staffId: r.staff_id, cents: r.amount_cents, method: r.method, paidOn: r.paid_on, note: r.note }));

  const lines = computePay({
    plans,
    from,
    to,
    services: appts.map((a) => ({ staffId: a.staff_id, cents: a.appointment_services.reduce((n, l) => n + l.price_quoted_cents, 0) })),
    retail,
    tips,
    rentPaid: rent.map((r) => ({ staffId: r.staffId, cents: r.cents })),
  });
  return { lines, plans, rent };
}
