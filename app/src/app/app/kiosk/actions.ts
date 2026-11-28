"use server";

import { pendingForms } from "@/lib/forms/server";

import { revalidatePath } from "next/cache";
import { phoneKey } from "@/lib/clients/import";
import { denied, getContext } from "@/lib/context";
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
  const no = denied(ctx, "booking.manage");
  if (no) return no;
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
export async function kioskCheckIn(appointmentId: string, phone: string): Promise<{ ok: true; forms: { token: string; title: string }[] } | { ok: false; error: string }> {
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
  revalidatePath("/app/calendar");
  revalidatePath("/app/today");
  // Forms still to fill in (consent, intake…): offered right on the tablet.
  const { data: a } = await ctx.supabase.from("appointments").select("client_id").eq("id", appointmentId).single();
  const forms = a ? (await pendingForms(ctx.supabase, ctx.business.id, a.client_id)).map((f) => ({ token: f.token, title: f.title })) : [];
  return { ok: true, forms };
}

/** A walk-in at the tablet: join the line, then their place and wait. */
export async function kioskJoin(name: string, phone: string): Promise<{ ok: true; place: number; wait: string } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "booking.manage");
  if (no) return no;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { joinLine, loadLine } = await import("@/lib/walkins/server");
  const { lineBusiness } = await import("../walkins/business");
  const db = createAdminClient();
  const b = await lineBusiness(ctx);
  const r = await joinLine(db, b, { name, phone, serviceIds: [], requested: null, source: "kiosk" });
  if (!r.ok) return r;
  const line = await loadLine(db, b);
  const i = line.waiting.findIndex((w) => w.id === r.id);
  revalidatePath("/app/walkins");
  return { ok: true, place: i + 1, wait: i >= 0 ? line.waiting[i].wait : "" };
}
