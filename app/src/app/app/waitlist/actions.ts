"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { visibleClientIds } from "@/lib/data/client-scope";
import { cleanEntry } from "@/lib/data/waitlist";
import { todayIn } from "@/lib/time/zone";

type Result = { ok: true } | { ok: false; error: string };

export interface WaitlistAdd {
  clientId: string;
  staffId: string | null;
  serviceIds: string[];
  weekdays: number[];
  timeFrom: number;
  timeTo: number;
  dateFrom: string;
  dateTo: string;
  note?: string;
}

export async function addToWaitlist(req: WaitlistAdd): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "booking.manage");
  if (no) return no;
  const scope = await visibleClientIds(ctx);
  if (scope && !scope.has(req.clientId)) return { ok: false, error: "You can't add this client." };
  const c = cleanEntry(req, todayIn(ctx.business.timezone));
  if (!c.ok) return c;
  if (req.staffId) {
    const { data: st } = await ctx.supabase.from("staff").select("id").eq("id", req.staffId).eq("business_id", ctx.business.id).maybeSingle();
    if (!st) return { ok: false, error: "Pick a stylist." };
  }
  const { error } = await ctx.supabase.from("waitlist").insert({ business_id: ctx.business.id, client_id: req.clientId, staff_id: req.staffId, source: "staff", ...c.v });
  if (error) return { ok: false, error: "Couldn't add to the waitlist." };
  revalidatePath("/app/waitlist");
  return { ok: true };
}

export async function removeFromWaitlist(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "booking.manage");
  if (no) return no;
  const { error } = await ctx.supabase.from("waitlist").update({ status: "removed", closed_at: new Date().toISOString() }).eq("id", id).eq("business_id", ctx.business.id).eq("status", "active");
  if (error) return { ok: false, error: "Couldn't remove it." };
  revalidatePath("/app/waitlist");
  return { ok: true };
}
