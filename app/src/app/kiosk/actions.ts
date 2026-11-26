"use server";

import { revalidatePath } from "next/cache";
import { phoneKey } from "@/lib/clients/import";
import { getContext } from "@/lib/context";
import { notifyAppointment } from "@/lib/notify/events";
import { addDays, formatTime, todayIn, zonedToUtc } from "@/lib/time/zone";

export interface KioskMatch {
  appointmentId: string;
  /** First name and last initial only: the kiosk faces the waiting area. */
  name: string;
  time: string;
  services: string[];
  checkedIn: boolean;
}

/** Today's appointments for the phone number typed at the kiosk. */
export async function kioskLookup(phone: string): Promise<{ ok: true; matches: KioskMatch[] } | { ok: false; error: string }> {
  const key = phoneKey(phone);
  if (key.length !== 10) return { ok: false, error: "Enter your 10-digit mobile number." };
  const ctx = await getContext();
  const tz = ctx.business.timezone;
  const today = todayIn(tz);
  const { data: clients, error } = await ctx.supabase.from("clients").select("id,phone").eq("business_id", ctx.business.id).ilike("phone", `%${key.slice(-4)}%`).limit(200);
  if (error) return { ok: false, error: "Something went wrong. Please let your stylist know you're here." };
  const ids = (clients ?? []).filter((c) => phoneKey(c.phone) === key).map((c) => c.id as string);
  if (!ids.length) return { ok: true, matches: [] };
  const { data: appts } = await ctx.supabase
    .from("appointments")
    .select("id,start_at,status,clients(first_name,last_name),appointment_services(sort,services(name))")
    .eq("business_id", ctx.business.id)
    .in("client_id", ids)
    .in("status", ["pending", "booked", "confirmed", "checked_in"])
    .gte("start_at", zonedToUtc(today, 0, tz).toISOString())
    .lt("start_at", zonedToUtc(addDays(today, 1), 0, tz).toISOString())
    .order("start_at");
  return {
    ok: true,
    matches: (appts ?? []).map((a) => {
      const c = a.clients as unknown as { first_name: string; last_name: string | null } | null;
      const lines = (a.appointment_services as unknown as { sort: number; services: { name: string } | null }[]) ?? [];
      return {
        appointmentId: a.id,
        name: `${c?.first_name ?? ""}${c?.last_name ? ` ${c.last_name[0]}.` : ""}`,
        time: formatTime(new Date(a.start_at), tz),
        services: [...lines].sort((x, y) => x.sort - y.sort).map((l) => l.services?.name ?? "Service"),
        checkedIn: a.status === "checked_in",
      };
    }),
  };
}

/** "I'm here": marks today's appointment checked in and alerts the stylist. The phone must match again. */
export async function kioskCheckIn(appointmentId: string, phone: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const found = await kioskLookup(phone);
  if (!found.ok) return found;
  if (!found.matches.some((m) => m.appointmentId === appointmentId)) return { ok: false, error: "We couldn't find that appointment. Please let your stylist know you're here." };
  const ctx = await getContext();
  const { data, error } = await ctx.supabase
    .from("appointments")
    .update({ status: "checked_in" })
    .eq("business_id", ctx.business.id)
    .eq("id", appointmentId)
    .in("status", ["booked", "confirmed", "pending"])
    .select("id");
  if (error) return { ok: false, error: "Something went wrong. Please let your stylist know you're here." };
  if (data?.length) await notifyAppointment(ctx.business.id, appointmentId, "checked_in");
  revalidatePath("/calendar");
  revalidatePath("/today");
  return { ok: true };
}
