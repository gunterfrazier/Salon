import "server-only";
import type { Ctx } from "@/lib/context";
import type { LineBusiness } from "@/lib/walkins/server";

/** The salon fields the walk-in line needs. */
export async function lineBusiness(ctx: Ctx): Promise<LineBusiness & { policy_settings: unknown; pricing_rules: { bundles?: unknown[] } }> {
  const { data } = await ctx.supabase.from("businesses").select("walkin_settings").eq("id", ctx.business.id).single();
  return { id: ctx.business.id, name: ctx.business.name, timezone: ctx.business.timezone, business_hours: ctx.business.business_hours, holidays: ctx.business.holidays, walkin_settings: data?.walkin_settings, policy_settings: ctx.business.policy_settings, pricing_rules: ctx.business.pricing_rules as { bundles?: unknown[] } };
}
