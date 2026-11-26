import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DayOff } from "../schedule/holidays";
import { parseRange } from "./calendar";

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

/** Staff busy time over a range: hands-on blocks and time off. */
export async function loadBusyRange(supabase: SupabaseClient, staffId: string, from: Date, to: Date): Promise<{ start: Date; end: Date }[]> {
  const [blocks, off] = await Promise.all([
    supabase.from("staff_busy_blocks").select("during").eq("staff_id", staffId).overlaps("during", `[${from.toISOString()},${to.toISOString()})`),
    supabase.from("time_off").select("start_at,end_at").eq("staff_id", staffId).lt("start_at", to.toISOString()).gt("end_at", from.toISOString()),
  ]);
  if (blocks.error) throw new Error(blocks.error.message);
  if (off.error) throw new Error(off.error.message);
  return [
    ...(blocks.data ?? []).map((x) => {
      const r = parseRange(x.during as string);
      return { start: new Date(r.start), end: new Date(r.end) };
    }),
    ...(off.data ?? []).map((t) => ({ start: new Date(t.start_at), end: new Date(t.end_at) })),
  ];
}
