"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { pushToStaff, vapidKeys } from "@/lib/push/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeNotificationSettings, validateNotificationSettings, type NotificationSettings } from "@/lib/notify/settings";

export async function saveNotificationSettings(input: NotificationSettings): Promise<{ ok: true } | { ok: false; error: string }> {
  // Merge over defaults so only known options are kept, then check them.
  const merged = mergeNotificationSettings(input);
  merged.client.reminders = merged.client.reminders.slice(0, 5).map((r, i) => ({
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 20) : `r${i + 1}`,
    before: { days: Number(r.before.days) || 0, hours: Number(r.before.hours) || 0, minutes: Number(r.before.minutes) || 0 },
    channels: r.channels.filter((c) => c === "sms" || c === "email"),
    enabled: !!r.enabled,
  }));
  const problem = validateNotificationSettings(merged);
  if (problem) return { ok: false, error: problem };
  const ctx = await getContext();
  const no = denied(ctx, "settings.messages");
  if (no) return no;
  const { error } = await ctx.supabase.from("businesses").update({ notification_settings: merged }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/notifications");
  return { ok: true };
}

/** Where the stylist's own alerts go (their staff record). */
export async function saveAlertContact(phone: string, email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = phone.trim().slice(0, 40);
  const e = email.trim().toLowerCase().slice(0, 200);
  if (p && p.replace(/\D/g, "").length < 10) return { ok: false, error: "Enter a 10-digit mobile number." };
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "That email doesn't look right." };
  const ctx = await getContext();
  const { error } = await ctx.supabase.from("staff").update({ phone: p || null, email: e || null }).eq("id", ctx.staff.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/notifications");
  return { ok: true };
}

// --- Push alerts on the stylist's own devices -------------------------------

/** Public key the browser needs to subscribe this device. */
export async function pushPublicKey(): Promise<string> {
  await getContext(); // signed-in staff only
  return (await vapidKeys(createAdminClient())).publicKey;
}

export async function savePushDevice(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, device: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false, error: "This browser didn't return a valid subscription." };
  const ctx = await getContext();
  const { error } = await ctx.supabase.from("push_subscriptions").upsert(
    { business_id: ctx.business.id, staff_id: ctx.staff.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device: device.slice(0, 120), failures: 0 },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/notifications");
  return { ok: true };
}

export async function removePushDevice(endpoint: string): Promise<{ ok: true }> {
  const ctx = await getContext();
  await ctx.supabase.from("push_subscriptions").delete().eq("staff_id", ctx.staff.id).eq("endpoint", endpoint);
  revalidatePath("/settings/notifications");
  return { ok: true };
}

export async function sendTestPush(): Promise<{ ok: true; devices: number } | { ok: false; error: string }> {
  const ctx = await getContext();
  const r = await pushToStaff(createAdminClient(), ctx.staff.id, { title: "Chairvana alerts are on", body: "You'll get new bookings, released holds and your day preview here.", url: "/today", tag: "test" });
  return r.ok ? { ok: true, devices: r.devices } : { ok: false, error: r.error ?? "Couldn't send" };
}
