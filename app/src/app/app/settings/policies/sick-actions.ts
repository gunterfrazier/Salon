"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { cleanSickSettings, type SickSettings } from "@/lib/sick/rules";

/** The salon's sick-day choices: substitutes, discounts (amount and who pays), stacking. */
export async function saveSickSettings(raw: SickSettings): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.payments");
  if (no) return no;
  const { error } = await ctx.supabase.from("businesses").update({ sick_settings: cleanSickSettings(raw) }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings/policies");
  return { ok: true };
}
