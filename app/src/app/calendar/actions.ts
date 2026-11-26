"use server";

import { revalidatePath } from "next/cache";
import { buildBooking, toBookable, type ServiceRow } from "@/lib/booking/build";
import { checkoutTotals, settleCancel } from "@/lib/checkout/settle";
import { cancelDefaults, type ChargeOption } from "@/lib/policy/engine";
import { getContext } from "@/lib/context";
import { loadClientStates, reviveClientState, type ClientStateJSON } from "@/lib/data/clients";
import { isDateStr, parseHHMM, zonedToUtc } from "@/lib/time/zone";
import { NEW_CLIENT_STATE } from "@/lib/ui/standing";

export async function fetchClientState(clientId: string): Promise<ClientStateJSON | null> {
  const ctx = await getContext();
  const states = await loadClientStates(ctx.supabase, ctx.business.id, [clientId]);
  return states[clientId] ?? null;
}

export interface BookingRequest {
  clientId?: string;
  newClient?: { firstName: string; lastName?: string; phone?: string; email?: string };
  serviceIds: string[];
  date: string;
  time: string;
  depositCents?: number;
  notes?: string;
}

export type BookingResponse = { ok: true; appointmentId: string } | { ok: false; error: string };

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

  if (!clientId) {
    const n = req.newClient!;
    const { data: created, error } = await supabase
      .from("clients")
      .insert({ business_id: business.id, first_name: clean(n.firstName), last_name: clean(n.lastName), phone: clean(n.phone), email: clean(n.email)?.toLowerCase() ?? null, source: "manual" })
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
    .select("id,status,start_at,client_id,appointment_services(id,price_quoted_cents)")
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
  const lines = (appt.appointment_services ?? []) as { id: string; price_quoted_cents: number }[];
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

export interface CloseRequest {
  appointmentId: string;
  mode: "cancel" | "no_show";
  reasonKey?: string;
  option: ChargeOption;
  flag: boolean;
  /** Collect what's owed now; otherwise it goes to the client's balance. */
  collect?: { method: string; reference?: string } | null;
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
  revalidatePath("/calendar");
  return { ok: true };
}
