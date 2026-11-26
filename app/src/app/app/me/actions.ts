"use server";

import { revalidatePath } from "next/cache";
import { bookableDates } from "@/lib/booking/availability";
import { moveStarts } from "@/lib/booking/move";
import { hoursFor } from "@/lib/staff/stylists";
import { settleCancel } from "@/lib/checkout/settle";
import { phoneKey } from "@/lib/clients/import";
import { whoAmI } from "@/lib/auth/whoami";
import { parseRange } from "@/lib/data/calendar";
import { loadClosedChecker, loadPublicBusiness } from "@/lib/data/public-booking";
import { loadBusyRange } from "@/lib/data/schedule";
import { notifyAppointment } from "@/lib/notify/events";
import { cancelDefaults } from "@/lib/policy/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { locatePlace, parsePlace } from "@/lib/geo";
import { openingsAcross, salonsNear, type SalonResult } from "@/lib/discovery/openings";
import { addDays, isDateStr, parseHHMM, todayIn, toHHMM, zonedToUtc } from "@/lib/time/zone";

type Result = { ok: true } | { ok: false; error: string };
const MOVABLE = ["pending", "booked", "confirmed"];

/** The signed-in client's own appointment, or null. */
async function ownAppointment(appointmentId: string) {
  const who = await whoAmI();
  if (who.kind !== "customer" || !who.links.length || !/^[0-9a-f-]{36}$/.test(appointmentId)) return null;
  const db = createAdminClient();
  const { data: a } = await db
    .from("appointments")
    .select("id,business_id,client_id,staff_id,start_at,end_at,status,appointment_services(id,price_quoted_cents,staff_busy_blocks(during))")
    .eq("id", appointmentId)
    .in("client_id", who.links.map((l) => l.clientId))
    .maybeSingle();
  if (!a) return null;
  return { who, db, a };
}

export async function portalCancel(appointmentId: string): Promise<Result> {
  const own = await ownAppointment(appointmentId);
  if (!own) return { ok: false, error: "Appointment not found." };
  const { db, a } = own;
  if (!MOVABLE.includes(a.status)) return { ok: false, error: "This appointment can't be cancelled online. Please contact the salon." };
  const { data: biz } = await db.from("businesses").select("policy_settings").eq("id", a.business_id).single();
  const policy = biz!.policy_settings;
  const now = new Date();
  const d = cancelDefaults({ by: "client_online" }, new Date(a.start_at), now, policy);
  const lines = (a.appointment_services ?? []) as { price_quoted_cents: number }[];
  const full = lines.reduce((n, l) => n + l.price_quoted_cents, 0);
  const { data: pays } = await db.from("payments").select("amount_cents").eq("appointment_id", a.id).eq("kind", "deposit").eq("status", "succeeded");
  const depositPaid = (pays ?? []).reduce((n, p) => n + p.amount_cents, 0);
  // Late cancellations are charged per policy when it's automatic; otherwise the stylist decides.
  const option = d.insideWindow && d.autoCharge ? d.defaultOption : { kind: "none" as const };
  const s = settleCancel(option, full, depositPaid, { refundDepositIfNoCharge: d.refundDepositIfNoCharge, collectNow: false });
  const { error } = await db.rpc("cancel_appointment", {
    p: {
      appointment_id: a.id,
      status: "cancelled",
      cancelled_by: "client",
      reason: d.insideWindow ? "Cancelled online (late)" : "Cancelled online",
      fee_cents: s.fee,
      flag_type: d.flagType,
      collect: null,
      balance_cents: s.balance,
      refund_cents: s.refund,
    },
  });
  if (error) return { ok: false, error: error.code === "P0002" ? "This appointment is already closed." : "Couldn't cancel. Please contact the salon." };
  const note = d.insideWindow ? (d.autoCharge ? "Late cancellation: charged per policy." : "Late cancellation: decide whether to charge.") : undefined;
  await notifyAppointment(a.business_id, a.id, "cancelled", undefined, { byClient: true, note });
  revalidatePath("/app/me");
  return { ok: true };
}

async function movableTimes(own: NonNullable<Awaited<ReturnType<typeof ownAppointment>>>, date: string) {
  const b = await loadPublicBusiness({ id: own.a.business_id });
  if (!b) return null;
  const tz = b.timezone;
  if (!bookableDates(todayIn(tz), b.hours, b.settings, await loadClosedChecker(b)).includes(date)) return { b, times: [] as number[] };
  const busyMine = ((own.a.appointment_services ?? []) as unknown as { staff_busy_blocks: { during: string }[] }[])
    .flatMap((l) => l.staff_busy_blocks.map((x) => parseRange(x.during)))
    .map((r) => ({ start: new Date(r.start), end: new Date(r.end) }));
  const busy = await loadBusyRange(own.db, own.a.business_id, own.a.staff_id, zonedToUtc(date, 0, tz), zonedToUtc(addDays(date, 1), 0, tz));
  const stylist = b.stylists.find((x) => x.id === own.a.staff_id);
  const earliest = new Date(Date.now() + b.settings.minNoticeHours * 3_600_000);
  return {
    b,
    times: moveStarts({ date, tz, hours: hoursFor(stylist, b.hours), appt: { start: new Date(own.a.start_at), end: new Date(own.a.end_at), busy: busyMine }, busy, now: earliest, stepMinutes: b.settings.stepMinutes }),
  };
}

/** Days and open times the client can move to. */
export async function portalMoveOptions(appointmentId: string, date?: string): Promise<{ ok: true; dates: string[]; times: string[] } | { ok: false; error: string }> {
  const own = await ownAppointment(appointmentId);
  if (!own) return { ok: false, error: "Appointment not found." };
  const b = await loadPublicBusiness({ id: own.a.business_id });
  if (!b) return { ok: false, error: "Online changes aren't available right now." };
  const dates = bookableDates(todayIn(b.timezone), b.hours, b.settings, await loadClosedChecker(b));
  if (!date) return { ok: true, dates, times: [] };
  if (!isDateStr(date)) return { ok: false, error: "Pick a day." };
  const r = await movableTimes(own, date);
  return { ok: true, dates, times: (r?.times ?? []).map(toHHMM) };
}

export async function portalMove(appointmentId: string, date: string, time: string): Promise<Result> {
  const own = await ownAppointment(appointmentId);
  if (!own) return { ok: false, error: "Appointment not found." };
  if (!MOVABLE.includes(own.a.status)) return { ok: false, error: "This appointment can't be changed online. Please contact the salon." };
  const { data: biz } = await own.db.from("businesses").select("policy_settings").eq("id", own.a.business_id).single();
  if (cancelDefaults({ by: "client_online" }, new Date(own.a.start_at), new Date(), biz!.policy_settings).insideWindow) {
    return { ok: false, error: "It's too close to your appointment to change it online. Please contact the salon." };
  }
  if (!isDateStr(date)) return { ok: false, error: "Pick a day." };
  let minutes: number;
  try {
    minutes = parseHHMM(time);
  } catch {
    return { ok: false, error: "Pick a time." };
  }
  const r = await movableTimes(own, date);
  if (!r || !r.times.includes(minutes)) return { ok: false, error: "That time was just taken. Please pick another." };
  const { error } = await own.db.rpc("move_appointment", { p: { appointment_id: own.a.id, new_start: zonedToUtc(date, minutes, r.b.timezone).toISOString() } });
  if (error) return { ok: false, error: error.code === "23P01" ? "That time was just taken. Please pick another." : "Couldn't change it. Please contact the salon." };
  await notifyAppointment(own.a.business_id, own.a.id, "moved", undefined, { byClient: true });
  revalidatePath("/app/me");
  return { ok: true };
}

export async function portalUpdateContact(phone: string, smsOptIn: boolean): Promise<Result> {
  const who = await whoAmI();
  if (who.kind !== "customer") return { ok: false, error: "Please sign in again." };
  const p = phone.trim().slice(0, 40);
  if (p && phoneKey(p).length < 10) return { ok: false, error: "Enter a 10-digit mobile number." };
  const db = createAdminClient();
  const patch = { phone: p || null, sms_opt_in: !!p && smsOptIn };
  const { error } = await db.from("customers").update(patch).eq("id", who.customerId);
  if (error) return { ok: false, error: "Couldn't save. Try again." };
  // Keep each salon's record in step.
  if (who.links.length) await db.from("clients").update(patch).in("id", who.links.map((l) => l.clientId));
  revalidatePath("/app/me");
  return { ok: true };
}

/** "My salon", "my stylist", home ZIP and how far to look. */
export async function savePreferences(p: { businessId: string | null; staffId: string | null; zip?: string; miles?: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  const who = await whoAmI();
  if (who.kind !== "customer") return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (p.businessId !== undefined) {
    if (p.businessId) {
      const { data: b } = await db.from("businesses").select("id").eq("id", p.businessId).eq("status", "approved").maybeSingle();
      if (!b) return { ok: false, error: "That salon isn't available." };
    }
    patch.preferred_business_id = p.businessId;
    patch.preferred_staff_id = null;
  }
  if (p.staffId) {
    const { data: s } = await db.from("staff").select("id,business_id,bookable,active").eq("id", p.staffId).maybeSingle();
    if (!s || !s.active || !s.bookable || (p.businessId && s.business_id !== p.businessId)) return { ok: false, error: "That stylist isn't available." };
    patch.preferred_business_id = s.business_id;
    patch.preferred_staff_id = s.id;
  }
  if (p.zip !== undefined) {
    const zip = p.zip.trim();
    if (zip) {
      const q = parsePlace(zip);
      const at = q ? await locatePlace(q) : null;
      if (!at) return { ok: false, error: "We couldn't find that ZIP or city. Try a 5-digit ZIP." };
      Object.assign(patch, { home_zip: zip.slice(0, 40), home_lat: at.lat, home_lng: at.lng });
    } else Object.assign(patch, { home_zip: null, home_lat: null, home_lng: null });
  }
  if (p.miles !== undefined) {
    if (![5, 10, 25, 50, 100].includes(p.miles)) return { ok: false, error: "Pick a distance." };
    patch.search_miles = p.miles;
  }
  const { error } = await db.from("customers").update(patch).eq("id", who.customerId);
  if (error) return { ok: false, error: "Couldn't save. Try again." };
  revalidatePath("/app/me");
  return { ok: true };
}

export type Level = "stylist" | "salon" | "area";

/**
 * Openings for the customer: with their stylist, anyone at their salon, or any
 * salon within their distance. Services default to their last visit's.
 */
export async function myOpenings(level: Level, serviceText?: string): Promise<{ ok: true; results: SalonResult[]; services: string[] } | { ok: false; error: string }> {
  const who = await whoAmI();
  if (who.kind !== "customer") return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data: c } = await db.from("customers").select("preferred_business_id,preferred_staff_id,home_lat,home_lng,search_miles").eq("id", who.customerId).single();
  if (!c) return { ok: false, error: "Please sign in again." };

  let wanted = (serviceText ?? "").split(/\s*\+\s*|,\s*/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
  if (!wanted.length) {
    // Last completed visit, preferring their salon.
    const ids = who.links.map((l) => l.clientId);
    if (ids.length) {
      const { data: last } = await db
        .from("appointments")
        .select("business_id,appointment_services(sort,services(name))")
        .in("client_id", ids)
        .eq("status", "completed")
        .order("start_at", { ascending: false })
        .limit(10);
      const pick = (last ?? []).find((a) => a.business_id === c.preferred_business_id) ?? last?.[0];
      wanted = ((pick?.appointment_services ?? []) as unknown as { sort: number; services: { name: string } | null }[]).sort((x, y) => x.sort - y.sort).map((l) => l.services?.name ?? "").filter(Boolean);
    }
  }
  if (!wanted.length) return { ok: false, error: "Tell us what you'd like (e.g. Women's Cut) to see openings." };

  const criteria = { weekdays: [], block: "any" as const, start: { kind: "next" as const } };
  if (level === "area") {
    if (c.home_lat == null) return { ok: false, error: "Add your home ZIP below to look nearby." };
    const near = await salonsNear({ lat: c.home_lat, lng: c.home_lng }, c.search_miles);
    if (!near.length) return { ok: true, results: [], services: wanted };
    return { ok: true, results: await openingsAcross(near.slice(0, 15), wanted, criteria), services: wanted };
  }
  if (!c.preferred_business_id) return { ok: false, error: "Pick your salon below first." };
  const { data: b } = await db.from("businesses").select("slug").eq("id", c.preferred_business_id).single();
  if (!b) return { ok: false, error: "Your salon isn't available right now." };
  const staff = level === "stylist" ? c.preferred_staff_id : null;
  if (level === "stylist" && !staff) return { ok: false, error: "Pick your stylist below first." };
  return { ok: true, results: await openingsAcross([{ slug: b.slug }], wanted, criteria, { [c.preferred_business_id]: staff }, 8), services: wanted };
}
