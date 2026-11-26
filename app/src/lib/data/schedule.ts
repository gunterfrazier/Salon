import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DayOff } from "../schedule/holidays";

/** One-time days off / blocked hours overlapping [from, to). */
export async function loadDaysOff(supabase: SupabaseClient, businessId: string, from: Date, to: Date): Promise<DayOff[]> {
  const { data, error } = await supabase
    .from("time_off")
    .select("id,start_at,end_at,reason,all_day")
    .eq("business_id", businessId)
    .lt("start_at", to.toISOString())
    .gt("end_at", from.toISOString())
    .order("start_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({ id: t.id, start: new Date(t.start_at).toISOString(), end: new Date(t.end_at).toISOString(), reason: t.reason, allDay: t.all_day }));
}
