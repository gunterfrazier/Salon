"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { applyForm, type PolicyForm } from "@/lib/policy/edit";

/** Save deposits, cancellation notice, fees and flag rules. */
export async function savePolicies(f: PolicyForm): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.payments");
  if (no) return no;
  const r = applyForm(ctx.business.policy_settings, f);
  if (!r.ok) return r;
  const { error } = await ctx.supabase.from("businesses").update({ policy_settings: r.policy }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  for (const p of ["/app/settings/policies", "/app/calendar", "/app/today"]) revalidatePath(p);
  revalidatePath("/s/[slug]", "page");
  return { ok: true };
}
