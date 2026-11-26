"use server";

import { revalidatePath } from "next/cache";
import { buildBooking, toBookable, type ServiceRow } from "@/lib/booking/build";
import { checkoutTotals, settleCancel } from "@/lib/checkout/settle";
import { cancelDefaults, type ChargeOption } from "@/lib/policy/engine";
import { getContext } from "@/lib/context";
import { loadClientStates, reviveClientState, type ClientStateJSON } from "@/lib/data/clients";
import { addDays, isDateStr, parseHHMM, todayIn, toHHMM, zonedToUtc } from "@/lib/time/zone";
import { NEW_CLIENT_STATE } from "@/lib/ui/standing";
import { loadBusyRange, loadDaysOff } from "@/lib/data/schedule";
import { blockedDuring, closureForDate, isClosedDay, mergeHolidays } from "@/lib/schedule/holidays";
import { bookingSettings } from "@/lib/booking/availability";
import { findOpenings, searchWindow, type Opening, type SearchCriteria } from "@/lib/booking/search";
import { menu } from "@/lib/menu";
import { suggestOrder } from "@/lib/schedule/plan";
import { notifyAppointment } from "@/lib/notify/events";
import { moveStarts } from "@/lib/booking/move";
import { parseRange } from "@/lib/data/calendar";
import { supplyWarnings } from "@/lib/data/inventory";

export async function fetchClientState(clientId: string): Promise<ClientStateJSON | null> {
  const ctx = await getContext();
  const states = await loadClientStates(ctx.supabase, ctx.business.id, [clientId]);
  return states[clientId] ?? null;
}

/** Inventory warnings for a client's usual color (from their last formula). */
export async function supplyFor(clientId: string): Promise<string[]> {
  if (!/^[0-9a-f-]{36}$/.test(clientId)) return [];
  const ctx = await getContext();
  try {
    return await supplyWarnings(ctx.supabase, ctx.business.id, clientId);
  } catch {
    return [];
  }
}

export interface BookingRequest {
  clientId?: string;
  newClient?: { firstName: string; lastName?: string; phone?: string; email?: string; smsOptIn?: boolean };
  serviceIds: string[];
  date: string;
  time: string;
  depositCents?: number;
  notes?: string;
  /** Stylist confirmed booking on a day the salon is scheduled to be closed. */
  confirmClosed?: boolean;
}

export type BookingResponse =
  | { ok: true; appointmentId: string }
  | { ok: false; error: string; closed?: { label: string; kind: "holiday" | "day_off" | "blocked_hours" } };

const clean = (s?: string) => (s ?? "").trim() || null;

/**
 * Save a stylist-created appointment. Everything is recomputed here from the
 * database (prices, times, deposit), never trusted from the browser.
 */
export async function createAppointment(req: BookingRequest): Promise<BookingResponse> {
  const ctx = await getContext();
  const { supabase, business, staff } = ctx;

  if (!isDateStr(req.date)) return { ok: false, error: "Pick a date." };
  let minutes: number;
  try {
    minutes = parseHHMM(req.time);
  } catch {
    return { ok: false, error: "Pick a start time." };
  }
  if (!Array.isArray(req.serviceIds) || req.serviceIds.length === 0) return { ok: false, error: "Pick at least one service." };
  if (!req.clientId && !clean(req.newClient?.firstName)) return { ok: false, error: "Pick a client or enter a new client's first name." };

  // Services, in the order chosen.
  const { data: rows, error: svcErr } = await supabase
    .from("services")
    .select("id,key,name,price_type,price_cents,estimated_hours,active_min,processing_min,finish_min,deposit_category,stage,includes,is_add_on")
    .eq("business_id", business.id)
    .in("id", req.serviceIds);
  if (svcErr) return { ok: false, error: svcErr.message };
  const byId = new Map((rows as ServiceRow[]).map((r) => [r.id, r]));
  if (req.serviceIds.some((id) => !byId.has(id))) return { ok: false, error: "One of the services no longer exists. Refresh and try again." };
  const services = req.serviceIds.map((id) => toBookable(byId.get(id)!));

  // Client: existing, or create a new one.
  let clientId = req.clientId ?? null;
  let state = NEW_CLIENT_STATE;
  if (clientId) {
    const states = await loadClientStates(supabase, business.id, [clientId]);
    if (!states[clientId]) return { ok: false, error: "Client not found." };
    state = reviveClientState(states[clientId]);
  }

  const result = buildBooking({
    services,
    start: zonedToUtc(req.date, minutes, business.timezone),
    rules: business.pricing_rules.bundles ?? [],
    policy: business.policy_settings,
    client: state,
    now: new Date(),
    depositCents: req.depositCents,
  });
  if (result.errors.length) return { ok: false, error: result.errors[0] };

  // Scheduled closure? Needs the stylist's confirmation (they may override).
  if (!req.confirmClosed) {
    const daysOff = await loadDaysOff(supabase, business.id, result.plan.start, result.plan.end);
    const rules = mergeHolidays(business.holidays);
    const day = closureForDate(req.date, business.timezone, rules, daysOff);
    const blocked = blockedDuring(result.plan.start, result.plan.end, daysOff);
    if (day && day.kind !== "blocked_hours") return { ok: false, error: `The salon is scheduled to be closed: ${day.label}.`, closed: day };
    if (blocked) return { ok: false, error: `That time is blocked: ${blocked.reason || "Blocked time"}.`, closed: { kind: "blocked_hours", label: blocked.reason || "Blocked time" } };
  }

  if (!clientId) {
    const n = req.newClient!;
    const { data: created, error } = await supabase
      .from("clients")
      .insert({ business_id: business.id, first_name: clean(n.firstName), last_name: clean(n.lastName), phone: clean(n.phone), email: clean(n.email)?.toLowerCase() ?? null, sms_opt_in: !!n.smsOptIn && !!clean(n.phone), source: "manual" })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Couldn't add client: ${error.message}` };
    clientId = created.id as string;
  }

  const { data: id, error } = await supabase.rpc("book_appointment", {
    p: { ...result.payload, business_id: business.id, client_id: clientId, staff_id: staff.id, booked_via: "stylist", notes: clean(req.notes) },
  });
  if (error) {
    if (error.code === "23P01") return { ok: false, error: "That time overlaps another appointment's hands-on time. Pick another time." };
    return { ok: false, error: `Couldn't save: ${error.message}` };
  }

  await notifyAppointment(business.id, id as string, "booked_by_stylist");
  revalidatePath("/calendar");
  return { ok: true, appointmentId: id as string };
}

// ---------------------------------------------------------------------------
// Close out: cancel, no-show, checkout
// ---------------------------------------------------------------------------

type Ctx = Awaited<ReturnType<typeof getContext>>;

async function loadForClose(ctx: Ctx, appointmentId: string) {
  const { supabase, business } = ctx;
  const { data: appt, error } = await supabase
    .from("appointments")
    .select("id,status,start_at,client_id,appointment_services(id,sort,price_quoted_cents,services(name))")
    .eq("business_id", business.id)
    .eq("id", appointmentId)
    .single();
  if (error || !appt) return null;
  const { data: pays } = await supabase
    .from("payments")
    .select("amount_cents")
    .eq("appointment_id", appointmentId)
    .eq("kind", "deposit")
    .eq("status", "succeeded");
  const lines = ((appt.appointment_services ?? []) as unknown as { id: string; sort: number; price_quoted_cents: number; services: { name: string } | null }[])
    .sort((x, y) => x.sort - y.sort)
    .map((l) => ({ id: l.id, price_quoted_cents: l.price_quoted_cents, name: l.services?.name ?? "Service" }));
  return {
    status: appt.status as string,
    start: new Date(appt.start_at),
    lines,
    fullPrice: lines.reduce((s, l) => s + l.price_quoted_cents, 0),
    depositPaid: (pays ?? []).reduce((s, p) => s + p.amount_cents, 0),
  };
}

const OPEN = new Set(["pending", "booked", "confirmed", "checked_in", "in_service"]);
const METHODS = new Set(["cash", "venmo_direct", "cash_app_direct", "zelle", "paypal_me", "apple_cash", "other"]);
const METHOD_LABEL: Record<string, string> = { cash: "cash", venmo_direct: "Venmo", cash_app_direct: "Cash App", zelle: "Zelle", paypal_me: "PayPal", apple_cash: "Apple Cash", other: "other" };

export interface CloseRequest {
  appointmentId: string;
  mode: "cancel" | "no_show";
  reasonKey?: string;
  option: ChargeOption;
  flag: boolean;
  /** Collect what's owed now; otherwise it goes to the client's balance. */
  collect?: { method: string; reference?: string } | null;
  /** Send the client a cancellation notice (default yes, if turned on in Settings › Messages). */
  notifyClient?: boolean;
}

export async function closeAppointment(req: CloseRequest): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const policy = ctx.business.policy_settings;
  const a = await loadForClose(ctx, req.appointmentId);
  if (!a) return { ok: false, error: "Appointment not found." };
  if (!OPEN.has(a.status)) return { ok: false, error: "This appointment is already closed." };
  if (req.collect && !METHODS.has(req.collect.method)) return { ok: false, error: "Pick how the client paid." };

  const reason = req.mode === "cancel" ? policy.stylistInitiatedCancel.reasons.find((r) => r.key === req.reasonKey) : null;
  if (req.mode === "cancel" && !reason) return { ok: false, error: "Pick a reason for cancelling." };

  const defaults = cancelDefaults(req.mode === "no_show" ? { by: "no_show" } : { by: "stylist", reasonKey: reason!.key }, a.start, new Date(), policy);
  let s;
  try {
    s = settleCancel(req.option, a.fullPrice, a.depositPaid, { refundDepositIfNoCharge: defaults.refundDepositIfNoCharge, collectNow: !!req.collect });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const flagType = req.mode === "no_show" ? "no_show" : "late_cancel";
  const clientCaused = req.mode === "no_show" || reason!.defaultCharge === "full_if_inside_window_else_none";

  const { error } = await ctx.supabase.rpc("cancel_appointment", {
    p: {
      appointment_id: req.appointmentId,
      status: req.mode === "no_show" ? "no_show" : "cancelled",
      cancelled_by: clientCaused ? "client" : "stylist",
      reason: req.mode === "no_show" ? "No-show" : reason!.label,
      fee_cents: s.fee,
      flag_type: req.flag && policy.flags.createOn.includes(flagType) ? flagType : null,
      collect: req.collect && s.collectNow > 0 ? { method: req.collect.method, amount_cents: s.collectNow, reference: clean(req.collect.reference) } : null,
      balance_cents: s.balance,
      refund_cents: s.refund,
    },
  });
  if (error) return { ok: false, error: error.code === "P0002" ? "This appointment is already closed." : `Couldn't save: ${error.message}` };
  if (req.mode === "cancel" && req.notifyClient !== false) await notifyAppointment(ctx.business.id, req.appointmentId, "cancelled");
  revalidatePath("/calendar");
  return { ok: true };
}

export interface CheckoutRequest {
  appointmentId: string;
  prices: { id: string; cents: number }[];
  tipCents: number;
  paidCents: number;
  method: string;
  reference?: string;
}

export async function checkoutAppointment(req: CheckoutRequest): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const a = await loadForClose(ctx, req.appointmentId);
  if (!a) return { ok: false, error: "Appointment not found." };
  if (!OPEN.has(a.status)) return { ok: false, error: "This appointment is already closed." };
  if (req.paidCents > 0 && !METHODS.has(req.method)) return { ok: false, error: "Pick how the client paid." };

  const byId = new Map(req.prices.map((p) => [p.id, p.cents]));
  if (a.lines.some((l) => !byId.has(l.id)) || req.prices.length !== a.lines.length) return { ok: false, error: "Services changed. Refresh and try again." };
  const prices = a.lines.map((l) => byId.get(l.id)!);

  let t;
  try {
    t = checkoutTotals({ prices, tip: req.tipCents, depositPaid: a.depositPaid, paid: req.paidCents });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { error } = await ctx.supabase.rpc("checkout_appointment", {
    p: {
      appointment_id: req.appointmentId,
      lines: a.lines.map((l, i) => ({ id: l.id, price_cents: prices[i] })),
      tip_cents: t.tip,
      payment: t.paid > 0 ? { method: req.method, amount_cents: t.paid, tip_cents: t.tipPaid, reference: clean(req.reference) } : null,
      balance_cents: t.balance,
      refund_cents: t.refund,
    },
  });
  if (error) return { ok: false, error: error.code === "P0002" ? "This appointment is already closed." : `Couldn't save: ${error.message}` };
  await notifyAppointment(ctx.business.id, req.appointmentId, "checked_out", {
    lines: a.lines.map((l, i) => ({ name: l.name, cents: prices[i] })),
    tip: t.tip,
    depositApplied: t.depositApplied,
    paid: t.paid,
    method: t.paid > 0 ? (METHOD_LABEL[req.method] ?? null) : null,
    balance: t.balance,
  });
  revalidatePath("/calendar");
  return { ok: true };
}

export async function markDepositReceived(appointmentId: string, amountCents: number, method: string, reference?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { ok: false, error: "Enter the deposit amount." };
  if (!METHODS.has(method)) return { ok: false, error: "Pick how the client paid." };
  const ctx = await getContext();
  const a = await loadForClose(ctx, appointmentId);
  if (!a) return { ok: false, error: "Appointment not found." };
  if (!OPEN.has(a.status)) return { ok: false, error: "This appointment is closed." };
  if (a.depositPaid + amountCents > a.fullPrice) return { ok: false, error: "That's more than the appointment total." };
  const { error } = await ctx.supabase.rpc("mark_deposit_received", { p: { appointment_id: appointmentId, amount_cents: amountCents, method, reference: clean(reference) } });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}

/** Stylist "Find a time": openings for services matching days / time block / start. */
export async function findTimes(serviceIds: string[], criteria: SearchCriteria): Promise<{ ok: true; openings: Opening[] } | { ok: false; error: string }> {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0 || serviceIds.length > 8) return { ok: false, error: "Pick at least one service." };
  const ctx = await getContext();
  const { supabase, business, staff } = ctx;
  const { data: rows, error } = await supabase
    .from("services")
    .select("id,key,name,price_type,price_cents,estimated_hours,active_min,processing_min,finish_min,deposit_category,stage,includes,is_add_on")
    .eq("business_id", business.id)
    .in("id", serviceIds);
  if (error) return { ok: false, error: error.message };
  const byId = new Map((rows as ServiceRow[]).map((r) => [r.id, r]));
  if (serviceIds.some((id) => !byId.has(id))) return { ok: false, error: "Pick your services again." };
  const services = suggestOrder(serviceIds.map((id) => toBookable(byId.get(id)!)), menu.stages);

  const tz = business.timezone;
  const today = todayIn(tz);
  const horizonDays = 365;
  const { first, last } = searchWindow(criteria.start, today, horizonDays);
  const from = zonedToUtc(first, 0, tz);
  const to = zonedToUtc(addDays(last, 1), 0, tz);
  const [busy, daysOff] = await Promise.all([loadBusyRange(supabase, staff.id, from, to), loadDaysOff(supabase, business.id, from, to)]);
  const rules = mergeHolidays(business.holidays);
  const settings = { ...bookingSettings(business.booking_settings), minNoticeHours: 0 };
  const openings = findOpenings({
    services,
    criteria,
    today,
    tz,
    hours: business.business_hours,
    isClosed: (d) => isClosedDay(d, tz, rules, daysOff),
    busy,
    now: new Date(),
    settings,
    horizonDays,
    limit: 30,
    perDay: 6,
  });
  return { ok: true, openings };
}

// ---------------------------------------------------------------------------
// Move (reschedule)
// ---------------------------------------------------------------------------

async function loadForMove(ctx: Ctx, appointmentId: string) {
  const { data, error } = await ctx.supabase
    .from("appointments")
    .select("id,status,start_at,end_at,appointment_services(staff_busy_blocks(during))")
    .eq("business_id", ctx.business.id)
    .eq("id", appointmentId)
    .single();
  if (error || !data) return null;
  const busy = ((data.appointment_services ?? []) as unknown as { staff_busy_blocks: { during: string }[] }[])
    .flatMap((l) => l.staff_busy_blocks.map((b) => parseRange(b.during)))
    .map((r) => ({ start: new Date(r.start), end: new Date(r.end) }));
  return { status: data.status as string, start: new Date(data.start_at), end: new Date(data.end_at), busy };
}

const MOVABLE = new Set(["pending", "booked", "confirmed"]);

async function movableTimes(ctx: Ctx, appt: NonNullable<Awaited<ReturnType<typeof loadForMove>>>, date: string) {
  const tz = ctx.business.timezone;
  const busy = await loadBusyRange(ctx.supabase, ctx.staff.id, zonedToUtc(date, 0, tz), zonedToUtc(addDays(date, 1), 0, tz));
  return moveStarts({ date, tz, hours: ctx.business.business_hours, appt, busy, now: new Date(), stepMinutes: bookingSettings(ctx.business.booking_settings).stepMinutes });
}

/** Open start times ("HH:MM") an appointment can move to on a date. */
export async function moveTimes(appointmentId: string, date: string): Promise<{ ok: true; times: string[]; closed: string | null } | { ok: false; error: string }> {
  if (!isDateStr(date)) return { ok: false, error: "Pick a date." };
  const ctx = await getContext();
  const appt = await loadForMove(ctx, appointmentId);
  if (!appt) return { ok: false, error: "Appointment not found." };
  if (!MOVABLE.has(appt.status)) return { ok: false, error: "Only upcoming appointments can be moved." };
  const tz = ctx.business.timezone;
  const daysOff = await loadDaysOff(ctx.supabase, ctx.business.id, zonedToUtc(date, 0, tz), zonedToUtc(addDays(date, 1), 0, tz));
  const day = closureForDate(date, tz, mergeHolidays(ctx.business.holidays), daysOff);
  return { ok: true, times: (await movableTimes(ctx, appt, date)).map(toHHMM), closed: day && day.kind !== "blocked_hours" ? day.label : null };
}

export interface MoveRequest {
  appointmentId: string;
  date: string;
  time: string;
  notifyClient?: boolean;
  confirmClosed?: boolean;
}

export async function moveAppointment(req: MoveRequest): Promise<BookingResponse> {
  if (!isDateStr(req.date)) return { ok: false, error: "Pick a date." };
  let minutes: number;
  try {
    minutes = parseHHMM(req.time);
  } catch {
    return { ok: false, error: "Pick a start time." };
  }
  const ctx = await getContext();
  const tz = ctx.business.timezone;
  const appt = await loadForMove(ctx, req.appointmentId);
  if (!appt) return { ok: false, error: "Appointment not found." };
  if (!MOVABLE.has(appt.status)) return { ok: false, error: "Only upcoming appointments can be moved." };
  if (!(await movableTimes(ctx, appt, req.date)).includes(minutes)) return { ok: false, error: "That time isn't open anymore. Pick another." };

  const newStart = zonedToUtc(req.date, minutes, tz);
  if (!req.confirmClosed) {
    const newEnd = new Date(newStart.getTime() + (appt.end.getTime() - appt.start.getTime()));
    const daysOff = await loadDaysOff(ctx.supabase, ctx.business.id, newStart, newEnd);
    const day = closureForDate(req.date, tz, mergeHolidays(ctx.business.holidays), daysOff);
    const blocked = blockedDuring(newStart, newEnd, daysOff);
    if (day && day.kind !== "blocked_hours") return { ok: false, error: `The salon is scheduled to be closed: ${day.label}.`, closed: day };
    if (blocked) return { ok: false, error: `That time is blocked: ${blocked.reason || "Blocked time"}.`, closed: { kind: "blocked_hours", label: blocked.reason || "Blocked time" } };
  }

  const { error } = await ctx.supabase.rpc("move_appointment", { p: { appointment_id: req.appointmentId, new_start: newStart.toISOString() } });
  if (error) {
    if (error.code === "23P01") return { ok: false, error: "That time overlaps another appointment. Pick another." };
    if (error.code === "P0002") return { ok: false, error: "Only upcoming appointments can be moved." };
    return { ok: false, error: `Couldn't move: ${error.message}` };
  }
  if (req.notifyClient !== false) await notifyAppointment(ctx.business.id, req.appointmentId, "moved");
  revalidatePath("/calendar");
  revalidatePath("/today");
  return { ok: true, appointmentId: req.appointmentId };
}
