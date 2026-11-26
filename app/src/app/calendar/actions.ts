"use server";

import { revalidatePath } from "next/cache";
import { buildBooking, toBookable, type ServiceRow } from "@/lib/booking/build";
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
