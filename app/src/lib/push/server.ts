import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateVapidKeys, sendPush, type VapidKeys } from "./webpush";

let cached: VapidKeys | null = null;

/** The app's push signing keys: created on first use and kept in app_secrets (service role only). */
export async function vapidKeys(admin: SupabaseClient): Promise<VapidKeys> {
  if (cached) return cached;
  const read = async () => (await admin.from("app_secrets").select("value").eq("key", "vapid").maybeSingle()).data?.value as VapidKeys | undefined;
  let keys = await read();
  if (!keys) {
    await admin.from("app_secrets").upsert({ key: "vapid", value: await generateVapidKeys() }, { onConflict: "key", ignoreDuplicates: true });
    keys = await read(); // whichever writer won
  }
  if (!keys) throw new Error("Couldn't set up push keys");
  cached = keys;
  return keys;
}

const subject = () => process.env.SITE_URL ?? "https://chairvana.app";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Sends to every device the staff member turned alerts on for. Removes devices that unsubscribed. */
export async function pushToStaff(admin: SupabaseClient, staffId: string, payload: PushPayload): Promise<{ ok: boolean; devices: number; error?: string }> {
  const { data: subs, error } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth,failures").eq("staff_id", staffId);
  if (error) return { ok: false, devices: 0, error: error.message };
  if (!subs?.length) return { ok: false, devices: 0, error: "No devices have alerts turned on" };
  const keys = await vapidKeys(admin);
  let ok = 0;
  let lastError: string | undefined;
  for (const s of subs) {
    const r = await sendPush(s, JSON.stringify(payload), keys, subject());
    if (r.ok) {
      ok++;
      await admin.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), failures: 0 }).eq("id", s.id);
    } else if (r.gone || s.failures >= 9) {
      await admin.from("push_subscriptions").delete().eq("id", s.id);
      lastError = r.error;
    } else {
      await admin.from("push_subscriptions").update({ failures: s.failures + 1 }).eq("id", s.id);
      lastError = r.error;
    }
  }
  return { ok: ok > 0, devices: ok, error: ok ? undefined : lastError };
}

export async function hasPushDevice(admin: SupabaseClient, staffId: string): Promise<boolean> {
  const { count } = await admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("staff_id", staffId);
  return (count ?? 0) > 0;
}
