"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { SOCIAL_KEYS, type Social } from "@/lib/social";
import { cleanPromo } from "@/lib/promo/promo";
import { loyaltySettings } from "@/lib/promo/loyalty";


/** Save social links (shown on the salon page). Handles like @intensitysalon become links. */
export async function saveSocial(raw: Social): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.salon");
  if (no) return no;
  const base = { instagram: "https://instagram.com/", facebook: "https://facebook.com/", tiktok: "https://tiktok.com/@", website: "https://" };
  const out: Social = {};
  for (const k of SOCIAL_KEYS) {
    let v = (raw[k] ?? "").trim();
    if (!v) continue;
    if (!/^https?:\/\//i.test(v)) v = base[k] + v.replace(/^@/, "");
    try {
      const u = new URL(v);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
      out[k] = u.toString().slice(0, 300);
    } catch {
      return { ok: false, error: `That ${k} link doesn't look right.` };
    }
  }
  const { error } = await ctx.supabase.from("businesses").update({ social: out }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't save." };
  revalidatePath("/app/marketing");
  return { ok: true };
}

/** Create or update a promo code. */
export async function savePromo(id: string | null, raw: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.salon");
  if (no) return no;
  const c = cleanPromo(raw);
  if (!c.ok) return c;
  const { error } = id
    ? await ctx.supabase.from("promo_codes").update(c.row).eq("id", id).eq("business_id", ctx.business.id)
    : await ctx.supabase.from("promo_codes").insert({ ...c.row, business_id: ctx.business.id });
  if (error) return { ok: false, error: error.code === "23505" ? "You already have a code with that name." : "Couldn't save the code." };
  revalidatePath("/app/marketing");
  return { ok: true };
}

export async function setPromoActive(id: string, active: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.salon");
  if (no) return no;
  const { error } = await ctx.supabase.from("promo_codes").update({ active }).eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't change it." };
  revalidatePath("/app/marketing");
  return { ok: true };
}

/** Save the punch card and referral settings. */
export async function saveLoyalty(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.salon");
  if (no) return no;
  const s = loyaltySettings(raw);
  const { error } = await ctx.supabase.from("businesses").update({ loyalty: s }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't save." };
  revalidatePath("/app/marketing");
  return { ok: true };
}
