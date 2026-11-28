"use server";

import { createAdminClient } from "@/lib/supabase/admin";

/** Leave the line from your status page. */
export async function leave(token: string): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f]{64}$/.test(String(token))) return { ok: false };
  const { error } = await createAdminClient().from("walkins").update({ status: "left", finished_at: new Date().toISOString() }).eq("token", token).eq("status", "waiting");
  return { ok: !error };
}
