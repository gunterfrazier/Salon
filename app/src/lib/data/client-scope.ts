import "server-only";
import type { getContext } from "../context";

type Ctx = Awaited<ReturnType<typeof getContext>>;

/**
 * Clients this person may see: everyone with "See all clients", otherwise
 * only clients they've had or have an appointment with. Returns null for "all".
 */
export async function visibleClientIds(ctx: Ctx): Promise<Set<string> | null> {
  if (ctx.can("clients.view_all")) return null;
  const ids = new Set<string>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await ctx.supabase.from("appointments").select("client_id").eq("business_id", ctx.business.id).eq("staff_id", ctx.staff.id).range(start, start + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) ids.add(r.client_id as string);
    if (!data || data.length < 1000) break;
  }
  return ids;
}
