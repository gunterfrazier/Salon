"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { isDateStr } from "@/lib/time/zone";

type Result = { ok: true } | { ok: false; error: string };
const METHODS = new Set(["cash", "venmo_direct", "cash_app_direct", "zelle", "paypal_me", "apple_cash", "other"]);

export interface PlanSave {
  payType: "none" | "commission" | "booth_rent";
  servicePct: number;
  retailPct: number;
  rentCents: number;
  rentPeriod: "week" | "month";
  collectsOwn: boolean;
}

export async function savePayPlan(staffId: string, p: PlanSave): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  if (!["none", "commission", "booth_rent"].includes(p.payType)) return { ok: false, error: "Pick how they're paid." };
  const pct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
  if (!pct(p.servicePct) || !pct(p.retailPct)) return { ok: false, error: "Commission is a percent from 0 to 100." };
  if (!Number.isInteger(p.rentCents) || p.rentCents < 0 || p.rentCents > 10_000_000) return { ok: false, error: "Check the rent amount." };
  if (!["week", "month"].includes(p.rentPeriod)) return { ok: false, error: "Rent is per week or per month." };
  const { error } = await ctx.supabase
    .from("staff")
    .update({ pay_type: p.payType, service_commission_pct: Math.round(p.servicePct * 100) / 100, retail_commission_pct: Math.round(p.retailPct * 100) / 100, booth_rent_cents: p.rentCents, booth_rent_period: p.rentPeriod, booth_collects_own: !!p.collectsOwn })
    .eq("id", staffId)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't save." };
  revalidatePath("/app/pay");
  return { ok: true };
}

export async function recordRent(staffId: string, cents: number, method: string, paidOn: string, note: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  if (!Number.isInteger(cents) || cents <= 0 || cents > 10_000_000) return { ok: false, error: "Enter the amount." };
  if (!METHODS.has(method)) return { ok: false, error: "Pick how they paid." };
  if (!isDateStr(paidOn)) return { ok: false, error: "Pick the date." };
  const { data: st } = await ctx.supabase.from("staff").select("id").eq("id", staffId).eq("business_id", ctx.business.id).maybeSingle();
  if (!st) return { ok: false, error: "Pick the person." };
  const { error } = await ctx.supabase.from("booth_rent_payments").insert({ business_id: ctx.business.id, staff_id: staffId, amount_cents: cents, method, paid_on: paidOn, note: note.trim().slice(0, 200) || null });
  if (error) return { ok: false, error: "Couldn't save." };
  revalidatePath("/app/pay");
  return { ok: true };
}

export async function deleteRent(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  const { error } = await ctx.supabase.from("booth_rent_payments").delete().eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't remove it." };
  revalidatePath("/app/pay");
  return { ok: true };
}
