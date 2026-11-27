import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneKey } from "../clients/import";

/**
 * A number replied STOP (or START): every client record and customer account
 * with that number, in every salon. STOP turns "OK to text" off and notes when;
 * START turns it back on only where it was on before the STOP.
 */
export async function setTextingFor(db: SupabaseClient, phone: string, on: boolean): Promise<{ changed: number }> {
  const key = phoneKey(phone);
  if (key.length !== 10) return { changed: 0 };
  let changed = 0;
  for (const table of ["clients", "customers"] as const) {
    // Phones are stored as typed ("(256) 555-1234", "+12565551234"…): narrow by the last 4 digits, then match exactly.
    const { data } = await db.from(table).select("id,phone,sms_opt_in,sms_stopped_at").ilike("phone", `%${key.slice(-4)}`).limit(500);
    const same = (data ?? []).filter((r) => phoneKey(r.phone as string) === key);
    const ids = on ? same.filter((r) => r.sms_stopped_at).map((r) => r.id) : same.filter((r) => r.sms_opt_in).map((r) => r.id);
    if (!ids.length) continue;
    const patch = on ? { sms_opt_in: true, sms_stopped_at: null } : { sms_opt_in: false, sms_stopped_at: new Date().toISOString() };
    const { error } = await db.from(table).update(patch).in("id", ids);
    if (!error) changed += ids.length;
  }
  return { changed };
}
