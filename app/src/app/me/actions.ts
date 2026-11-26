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
import { addDays, isDateStr, parseHHMM, todayIn, toHHMM, zonedToUtc } from "@/lib/time/zone";

type Result = { ok: true } | { ok: false; error: string };
const MOVABLE = ["pending", "booked", "confirmed"];

/** The signed-in client's own appointment, or null. */
async function ownAppointment(appointmentId: string) {
  const who = await whoAmI();
  if (who.kind !== "client" || !/^[0-9a-f-]{36}$/.test(appointmentId)) return null;
  const db = createAdminClient();
  const { data: a } = await db
    .from("appointments")
    .select("id,business_id,client_id,staff_id,start_at,end_at,status,appointment_services(id,price_quoted_cents,staff_busy_blocks(during))")
    .eq("id", appointmentId)
    .eq("client_id", who.clientId)
    .eq("business_id", who.businessId)
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
  revalidatePath("/me");
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
  revalidatePath("/me");
  return { ok: true };
}

export async function portalUpdateContact(phone: string, smsOptIn: boolean): Promise<Result> {
  const who = await whoAmI();
  if (who.kind !== "client") return { ok: false, error: "Please sign in again." };
  const p = phone.trim().slice(0, 40);
  if (p && phoneKey(p).length < 10) return { ok: false, error: "Enter a 10-digit mobile number." };
  const { error } = await createAdminClient().from("clients").update({ phone: p || null, sms_opt_in: !!p && smsOptIn }).eq("id", who.clientId).eq("business_id", who.businessId);
  if (error) return { ok: false, error: "Couldn't save. Try again." };
  revalidatePath("/me");
  return { ok: true };
}
