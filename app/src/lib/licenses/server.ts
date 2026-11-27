import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyStaff } from "../notify/events";
import { addDays } from "../time/zone";
import { bookingExpiry, kindLabel, REMINDER_DAYS, reminderDue, reminderText } from "./rules";

export const LICENSE_BUCKET = "licenses";

/** Keep staff.license_expires_on (every team they're on) in step with their licenses. */
export async function syncBookingExpiry(db: SupabaseClient, authUserId: string): Promise<void> {
  const { data } = await db.from("licenses").select("kind,expires_on").eq("auth_user_id", authUserId);
  await db.from("staff").update({ license_expires_on: bookingExpiry(data ?? []) }).eq("auth_user_id", authUserId);
}

type Membership = { id: string; business_id: string; role: string; display_name: string; businesses: { kind: string } | null };

/**
 * License reminders, run by the 5-minute job (each reminder goes out once):
 * the license holder at 90, 60, 30 and 7 days and on the day; the owners of
 * salons they work at from 30 days on; a salon's own license to its owners.
 */
export async function runLicenseReminders(db: SupabaseClient, now: Date): Promise<{ sent: number }> {
  const today = now.toISOString().slice(0, 10);
  const dates = REMINDER_DAYS.map((d) => addDays(today, d));
  const { data } = await db.from("licenses").select("id,auth_user_id,business_id,kind,state,expires_on").in("expires_on", dates);
  let sent = 0;
  for (const l of data ?? []) {
    const days = reminderDue(l.expires_on as string, today);
    if (days === null) continue;
    const key = `license:${l.id}:${l.expires_on}:${days}`;
    if (l.business_id) {
      await notifyStaff(l.business_id as string, null, "licenseReminder", `The salon's ${reminderText(l.kind as string, l.state as string, l.expires_on as string, days, "you").replace(/^Your /, "")}`, key, () => true);
      sent++;
      continue;
    }
    const { data: rows } = await db.from("staff").select("id,business_id,role,display_name,businesses(kind)").eq("auth_user_id", l.auth_user_id).eq("active", true).is("suspended_at", null).order("created_at");
    const teams = (rows ?? []) as unknown as Membership[];
    if (!teams.length) continue;
    // The holder: once, through their own business if they have one.
    const home = teams.find((t) => t.businesses?.kind === "solo") ?? teams[0];
    await notifyStaff(home.business_id, home.id, "licenseReminder", reminderText(l.kind as string, l.state as string, l.expires_on as string, days, "you"), key, () => true);
    sent++;
    // Salons they work at (not their own): the owners hear from 30 days on.
    if (days <= 30) {
      for (const t of teams.filter((x) => x.role !== "owner" && x.businesses?.kind !== "solo")) {
        await notifyStaff(t.business_id, null, "licenseTeam", reminderText(l.kind as string, l.state as string, l.expires_on as string, days, t.display_name).replace("Renew it with the state board, then update it in Chairvana (Licenses).", `See Licenses in Chairvana.`), `${key}:team`, () => true);
        sent++;
      }
    }
  }
  return { sent };
}

export const licenseTitle = (l: { kind: string; state: string }) => `${l.state} ${kindLabel(l.kind)}`;
