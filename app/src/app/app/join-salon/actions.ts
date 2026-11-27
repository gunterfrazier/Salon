"use server";

import { revalidatePath } from "next/cache";
import { getContext, type Ctx } from "@/lib/context";
import { membershipsOf } from "@/lib/setup/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeJoinCode } from "@/lib/team/codes";
import { createJoinRequest, redeemJoinCode, type Joiner } from "@/lib/team/join";

type Result = { ok: true; text: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

async function joiner(ctx: Ctx): Promise<Joiner> {
  const { data } = await ctx.supabase.from("staff").select("phone").eq("id", ctx.staff.id).single();
  return { authUserId: ctx.user.id, name: ctx.staff.display_name, email: (ctx.user.email ?? "").toLowerCase(), phone: (data?.phone as string | null) ?? null };
}

/** Salons on Chairvana by name or web address (not ones you're already on). */
export async function searchSalons(q: string): Promise<{ id: string; name: string; place: string }[]> {
  const ctx = await getContext();
  const text = String(q ?? "").trim().replace(/[%_,()]/g, " ").slice(0, 60);
  if (text.length < 2) return [];
  const mine = new Set((await membershipsOf(ctx.user.id)).map((m) => m.businessId));
  const { data } = await createAdminClient()
    .from("businesses")
    .select("id,name,city,state,slug")
    .eq("status", "approved")
    .eq("kind", "salon")
    .or(`name.ilike.%${text}%,slug.ilike.%${text.replace(/\s+/g, "-")}%`)
    .order("name")
    .limit(10);
  return (data ?? []).filter((b) => !mine.has(b.id)).map((b) => ({ id: b.id, name: b.name, place: [b.city, b.state].filter(Boolean).join(", ") }));
}

export async function askToJoin(businessId: string, message: string): Promise<Result> {
  const ctx = await getContext();
  if (!UUID.test(businessId)) return { ok: false, error: "Pick the salon again." };
  if (!ctx.user.email) return { ok: false, error: "Your account needs an email first." };
  const db = createAdminClient();
  const { data: biz } = await db.from("businesses").select("id,name").eq("id", businessId).eq("status", "approved").eq("kind", "salon").maybeSingle();
  if (!biz) return { ok: false, error: "That salon isn't taking requests." };
  if ((await membershipsOf(ctx.user.id)).some((m) => m.businessId === businessId)) return { ok: false, error: `You're already on ${biz.name}'s team.` };
  const r = await createJoinRequest(db, businessId, await joiner(ctx), { message });
  if (!r.ok) return r;
  revalidatePath("/app/join-salon");
  return { ok: true, text: `Request sent to ${biz.name}. You'll see it here once they answer. Keep using your own account meanwhile.` };
}

export async function redeemCode(raw: string): Promise<Result> {
  const ctx = await getContext();
  const code = normalizeJoinCode(raw);
  if (!code) return { ok: false, error: "Join codes are 8 letters and numbers." };
  if (!ctx.user.email) return { ok: false, error: "Your account needs an email first." };
  const r = await redeemJoinCode(createAdminClient(), code, await joiner(ctx));
  if (!r.ok) return r;
  revalidatePath("/app/join-salon");
  return { ok: true, text: r.joined ? `You're on ${r.salon}'s team. Use Switch at the top to open it.` : `Request sent to ${r.salon}. You'll see it here once they answer.` };
}

export async function cancelJoinRequest(id: string): Promise<Result> {
  const ctx = await getContext();
  if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
  const { error } = await createAdminClient().from("salon_join_requests").update({ status: "cancelled", decided_at: new Date().toISOString() }).eq("id", id).eq("auth_user_id", ctx.user.id).eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/join-salon");
  return { ok: true, text: "Request cancelled." };
}
