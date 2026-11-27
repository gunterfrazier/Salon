"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { SOCIAL_KEYS, type Social } from "@/lib/social";


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
