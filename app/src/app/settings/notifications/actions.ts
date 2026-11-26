"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
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
  const { error } = await ctx.supabase.from("businesses").update({ notification_settings: merged }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/notifications");
  return { ok: true };
}
