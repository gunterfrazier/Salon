import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { availableStarts } from "../booking/availability";
import { buildBooking, toBookable, type BookableService, type ServiceRow } from "../booking/build";
import { findOpenings, searchWindow, type StartMode } from "../booking/search";
import { loadClientStates, reviveClientState } from "../data/clients";
import { loadBusy, loadClosedChecker, loadPublicBusiness, type PublicBusiness } from "../data/public-booking";
import { loadBusyRange } from "../data/schedule";
import { notifyAppointment, notifySickOffer, notifyStaff } from "../notify/events";
import type { ClientPolicyState } from "../policy/types";
import { asDoneBy, hoursFor, whoOffers, type Stylist } from "../staff/stylists";
import { createAdminClient } from "../supabase/admin";
import { addDays, formatDay, formatTime, todayIn, wallParts, zonedToUtc, type DateStr } from "../time/zone";
import { NEW_CLIENT_STATE } from "../ui/standing";
import { applySickDiscount, classify, cleanSickSettings, optionAllowed, optionBadge, sickDiscount, type PricedLine, type SickOptionKey, type SickSettings } from "./rules";

const site = () => (process.env.SITE_URL ?? "https://chairvana.app").replace(/\/$/, "");
export const offerLink = (token: string) => `${site()}/o/${token}`;
const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
const MOVABLE = new Set(["pending", "booked", "confirmed"]);
/** Discounts a rebooking keeps from the original booking (packages are worked out again). */
const CARRIED = new Set(["promo", "manual"]);

type OrigLine = { service_id: string; sort: number; discounts: PricedLine["discounts"] };

export interface OfferContext {
  offer: { id: string; status: string; expiresAt: Date; appointmentId: string; clientId: string; sickDayId: string };
  b: PublicBusiness;
  settings: SickSettings;
  appt: { id: string; staffId: string; start: Date; status: string; depositRequired: number; lines: OrigLine[] };
  services: BookableService[];
  client: ClientPolicyState;
  clientName: string;
  sick: { staffId: string; name: string; startsOn: DateStr; endsOn: DateStr };
  /** Still usable: open, not expired, appointment still upcoming. */
  usable: boolean;
}

export async function loadOffer(token: string): Promise<OfferContext | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const db = createAdminClient();
  const { data: o } = await db.from("sick_offers").select("id,business_id,status,expires_at,appointment_id,client_id,sick_day_id").eq("token", token).maybeSingle();
  if (!o) return null;
  const [b, { data: biz }, { data: a }, { data: sd }] = await Promise.all([
    loadPublicBusiness({ id: o.business_id as string, anyStatus: true }),
    db.from("businesses").select("sick_settings").eq("id", o.business_id).single(),
    db.from("appointments").select("id,staff_id,start_at,status,deposit_required_cents,clients(first_name),appointment_services(service_id,sort,discounts)").eq("id", o.appointment_id).single(),
    db.from("sick_days").select("staff_id,starts_on,ends_on,staff:staff!sick_days_staff_id_fkey(display_name)").eq("id", o.sick_day_id).single(),
  ]);
  if (!b || !a || !sd) return null;
  const lines = ((a.appointment_services ?? []) as unknown as OrigLine[]).sort((x, y) => x.sort - y.sort);
  const { data: rows } = await db
    .from("services")
    .select("id,key,name,price_type,price_cents,estimated_hours,active_min,processing_min,finish_min,deposit_category,stage,includes,is_add_on")
    .in("id", lines.map((l) => l.service_id));
  const byId = new Map(((rows ?? []) as ServiceRow[]).map((r) => [r.id, r]));
  if (lines.some((l) => !byId.has(l.service_id))) return null;
  const states = await loadClientStates(db, b.id, [o.client_id as string]);
  const expiresAt = new Date(o.expires_at as string);
  const status = o.status as string;
  return {
    offer: { id: o.id as string, status, expiresAt, appointmentId: a.id as string, clientId: o.client_id as string, sickDayId: o.sick_day_id as string },
    b,
    settings: cleanSickSettings(biz?.sick_settings),
    appt: { id: a.id as string, staffId: a.staff_id as string, start: new Date(a.start_at as string), status: a.status as string, depositRequired: a.deposit_required_cents as number, lines },
    services: lines.map((l) => toBookable(byId.get(l.service_id)!)),
    client: states[o.client_id as string] ? reviveClientState(states[o.client_id as string]) : NEW_CLIENT_STATE,
    clientName: (a.clients as unknown as { first_name: string } | null)?.first_name ?? "",
    sick: { staffId: sd.staff_id as string, name: (sd.staff as unknown as { display_name: string } | null)?.display_name ?? "Your stylist", startsOn: sd.starts_on as DateStr, endsOn: sd.ends_on as DateStr },
    usable: status === "open" && expiresAt.getTime() > Date.now() && MOVABLE.has(a.status as string),
  };
}

/** The prices for these services with this stylist at this time, keeping promo codes, with the sick-day discount. */
function priceFor(ctx: OfferContext, stylist: Stylist, start: Date, option: SickOptionKey) {
  const services = asDoneBy(ctx.services, stylist);
  const built = buildBooking({ services, start, rules: ctx.b.rules, policy: ctx.b.policy, client: ctx.client, now: new Date(), depositCents: ctx.appt.depositRequired });
  const lines = built.payload.services.map((l) => {
    const orig = ctx.appt.lines.find((x) => x.service_id === l.service_id);
    const carried = (orig?.discounts ?? []).filter((d) => CARRIED.has(d.source));
    const off = carried.reduce((n, d) => n + d.amount_cents, 0);
    return { ...l, discounts: [...l.discounts, ...carried], price_quoted_cents: Math.max(0, l.price_quoted_cents - off) };
  });
  const was = lines.reduce((n, l) => n + l.price_quoted_cents, 0);
  const want = sickDiscount(ctx.settings, option, was);
  const { lines: final, applied } = applySickDiscount(lines, want.cents, ctx.settings.stack);
  const salon = want.cents ? Math.round((applied * want.salon) / want.cents) : 0;
  return {
    payload: { start_at: built.payload.start_at, end_at: built.payload.end_at, services: final },
    was,
    total: final.reduce((n, l) => n + l.price_quoted_cents, 0),
    discount: { cents: applied, salon, stylist: applied - salon },
  };
}

export interface Choice {
  option: SickOptionKey;
  staffId: string;
  staffName: string;
  start: string;
  label: string;
  badge: string | null;
  total: number;
  was: number;
}

/** Real open times for each allowed option (a few each), priced. */
export async function offerChoices(ctx: OfferContext): Promise<Record<SickOptionKey, Choice[]>> {
  const out: Record<SickOptionKey, Choice[]> = { sameWindowOther: [], sameDayOther: [], otherDaySame: [], otherDayOther: [] };
  const { b, settings } = ctx;
  const tz = b.timezone;
  const today = todayIn(tz);
  const horizon = Math.min(b.settings.maxDaysAhead, 60);
  const isClosed = await loadClosedChecker(b);
  const db = createAdminClient();
  const origDate = wallParts(ctx.appt.start, tz).date;
  const able = whoOffers(b.stylists, ctx.services.map((s) => s.id));

  const openings = async (st: Stylist, start: StartMode, limit: number, perDay: number) => {
    const { first, last } = searchWindow(start, today, horizon);
    const busy = await loadBusyRange(db, b.id, st.id, zonedToUtc(first, 0, tz), zonedToUtc(addDays(last, 1), 0, tz));
    return findOpenings({ services: asDoneBy(ctx.services, st), criteria: { weekdays: [], block: "any", start }, today, tz, hours: hoursFor(st, b.hours), isClosed, busy, now: new Date(), settings: b.settings, horizonDays: horizon, limit, perDay });
  };
  const add = (st: Stylist, date: DateStr, minutes: number) => {
    const start = zonedToUtc(date, minutes, tz);
    const option = classify({ origStart: ctx.appt.start, origStaff: ctx.sick.staffId, start, staff: st.id, tz, windowMinutes: settings.windowMinutes });
    if (!option || !optionAllowed(settings, option)) return;
    const p = priceFor(ctx, st, start, option);
    out[option].push({ option, staffId: st.id, staffName: st.name.split(" ")[0], start: start.toISOString(), label: `${formatDay(date, { weekday: "short", month: "short", day: "numeric" })} at ${formatTime(start, tz)}`, badge: p.discount.cents ? optionBadge(settings, option) : null, total: p.total, was: p.was });
  };

  // Their own stylist, once they're back.
  const own = able.find((s) => s.id === ctx.sick.staffId);
  if (own) for (const o of await openings(own, { kind: "date", date: addDays(ctx.sick.endsOn, 1) > today ? addDays(ctx.sick.endsOn, 1) : today }, 6, 2)) if (o.date > ctx.sick.endsOn) add(own, o.date, o.minutes);

  if (settings.substitutes) {
    for (const st of able.filter((s) => s.id !== ctx.sick.staffId)) {
      // The same day (closest to the original time first)…
      if (origDate >= today) for (const o of await openings(st, { kind: "date", date: origDate }, 12, 12)) if (o.date === origDate) add(st, o.date, o.minutes);
      // …and other days.
      for (const o of await openings(st, { kind: "next" }, 6, 1)) if (o.date !== origDate) add(st, o.date, o.minutes);
    }
  }
  const near = (c: Choice) => Math.abs(Date.parse(c.start) - ctx.appt.start.getTime());
  out.sameWindowOther = out.sameWindowOther.sort((x, y) => near(x) - near(y)).slice(0, 6);
  out.sameDayOther = out.sameDayOther.sort((x, y) => near(x) - near(y)).slice(0, 6);
  out.otherDaySame = out.otherDaySame.slice(0, 6);
  out.otherDayOther = out.otherDayOther.sort((x, y) => x.start.localeCompare(y.start)).slice(0, 6);
  return out;
}

type Done = { ok: true; when: string; stylist: string; total: number; discount: number } | { ok: false; error: string };

/** The client picked a time: checked again (it may have just been taken), then the appointment moves there. */
export async function rebookFromOffer(token: string, staffId: string, startIso: string): Promise<Done> {
  const ctx = await loadOffer(token);
  if (!ctx) return { ok: false, error: "This link isn't valid." };
  if (!ctx.usable) return { ok: false, error: "This link has closed. Please contact the salon." };
  const { b } = ctx;
  const st = whoOffers(b.stylists, ctx.services.map((s) => s.id)).find((s) => s.id === staffId);
  const start = new Date(startIso);
  if (!st || Number.isNaN(start.getTime())) return { ok: false, error: "Pick a time again." };
  const option = classify({ origStart: ctx.appt.start, origStaff: ctx.sick.staffId, start, staff: st.id, tz: b.timezone, windowMinutes: ctx.settings.windowMinutes });
  if (!option || !optionAllowed(ctx.settings, option)) return { ok: false, error: "That time isn't one of the choices. Pick another." };
  const { date, minutes } = wallParts(start, b.timezone);
  const starts = availableStarts({ date, tz: b.timezone, hours: hoursFor(st, b.hours), services: asDoneBy(ctx.services, st), busy: await loadBusy(b, date, st.id), now: new Date(), settings: b.settings });
  if (!starts.includes(minutes)) return { ok: false, error: "Someone just took that time. Please pick another." };

  const db = createAdminClient();
  // Claim the link first so a double tap can't rebook twice.
  const { data: claimed } = await db.from("sick_offers").update({ status: "rescheduled", resolved_at: new Date().toISOString() }).eq("id", ctx.offer.id).eq("status", "open").select("id");
  if (!claimed?.length) return { ok: false, error: "This link was already used." };
  const p = priceFor(ctx, st, start, option);
  const { error } = await db.rpc("rebook_appointment", { p: { appointment_id: ctx.appt.id, staff_id: st.id, start_at: p.payload.start_at, end_at: p.payload.end_at, services: p.payload.services } });
  if (error) {
    await db.from("sick_offers").update({ status: "open", resolved_at: null }).eq("id", ctx.offer.id);
    return { ok: false, error: error.code === "23P01" ? "Someone just took that time. Please pick another." : "Couldn't move your appointment. Please try again." };
  }
  await db.from("sick_offers").update({ choice: option, new_staff_id: st.id, new_start: start.toISOString(), discount_cents: p.discount.cents, salon_pays_cents: p.discount.salon, stylist_pays_cents: p.discount.stylist }).eq("id", ctx.offer.id);
  await notifyAppointment(b.id, ctx.appt.id, "moved", undefined, { byClient: true });
  return { ok: true, when: `${formatDay(date, { weekday: "long", month: "long", day: "numeric" })} at ${formatTime(start, b.timezone)}`, stylist: st.name.split(" ")[0], total: p.total, discount: p.discount.cents };
}

/** The client would rather cancel: no fee (their stylist is out). */
export async function cancelFromOffer(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await loadOffer(token);
  if (!ctx) return { ok: false, error: "This link isn't valid." };
  if (!ctx.usable) return { ok: false, error: "This link has closed. Please contact the salon." };
  const db = createAdminClient();
  const { data: claimed } = await db.from("sick_offers").update({ status: "cancelled", choice: "cancel", resolved_at: new Date().toISOString() }).eq("id", ctx.offer.id).eq("status", "open").select("id");
  if (!claimed?.length) return { ok: false, error: "This link was already used." };
  const { error } = await db.rpc("cancel_appointment", { p: { appointment_id: ctx.appt.id, status: "cancelled", cancelled_by: "client", reason: "Stylist out sick: client cancelled (no fee)" } });
  if (error) {
    await db.from("sick_offers").update({ status: "open", choice: null, resolved_at: null }).eq("id", ctx.offer.id);
    return { ok: false, error: "Couldn't cancel. Please contact the salon." };
  }
  await notifyAppointment(ctx.b.id, ctx.appt.id, "cancelled", undefined, { byClient: true });
  return { ok: true };
}

/**
 * Mark a stylist out sick for some days: their time off (no new bookings), a
 * link for each affected client, and (optionally) the message with it.
 */
export async function markOutSick(db: SupabaseClient, i: { businessId: string; staffId: string; staffName: string; from: DateStr; to: DateStr; reason: string | null; by: string; tz: string; notify: boolean }): Promise<{ sickDayId: string; offers: number; sent: number; notSent: number }> {
  const start = zonedToUtc(i.from, 0, i.tz);
  const end = zonedToUtc(addDays(i.to, 1), 0, i.tz);
  const { data: off, error: offErr } = await db.from("time_off").insert({ business_id: i.businessId, staff_id: i.staffId, start_at: start.toISOString(), end_at: end.toISOString(), all_day: true, salon_wide: false, reason: i.reason ? `Out sick: ${i.reason}` : "Out sick" }).select("id").single();
  if (offErr) throw new Error(offErr.message);
  const { data: sd, error: sdErr } = await db.from("sick_days").insert({ business_id: i.businessId, staff_id: i.staffId, starts_on: i.from, ends_on: i.to, reason: i.reason, time_off_id: off.id, created_by: i.by }).select("id").single();
  if (sdErr) throw new Error(sdErr.message);

  const { data: biz } = await db.from("businesses").select("sick_settings").eq("id", i.businessId).single();
  const settings = cleanSickSettings(biz?.sick_settings);
  const { data: appts } = await db
    .from("appointments")
    .select("id,client_id,start_at")
    .eq("business_id", i.businessId)
    .eq("staff_id", i.staffId)
    .in("status", ["pending", "booked", "confirmed"])
    .gte("start_at", new Date(Math.max(start.getTime(), Date.now())).toISOString())
    .lt("start_at", end.toISOString())
    .order("start_at");
  let sent = 0;
  let notSent = 0;
  for (const a of appts ?? []) {
    const startAt = new Date(a.start_at as string);
    // Open until the original start (or the salon's cut-off); never less than an hour from now.
    const expires = new Date(Math.max(startAt.getTime() - settings.closeHoursBefore * 3_600_000, Date.now() + 3_600_000));
    const token = newToken();
    const { error } = await db.from("sick_offers").insert({ business_id: i.businessId, sick_day_id: sd.id, appointment_id: a.id, client_id: a.client_id, original_start: startAt.toISOString(), token, expires_at: expires.toISOString() });
    if (error) continue;
    if (i.notify) {
      const r = await notifySickOffer(i.businessId, a.id as string, offerLink(token), i.staffName.split(" ")[0]);
      if (r.sent) {
        sent++;
        await db.from("sick_offers").update({ sent_at: new Date().toISOString() }).eq("token", token);
      } else notSent++;
    }
  }
  return { sickDayId: sd.id as string, offers: (appts ?? []).length, sent, notSent };
}

/** Let the owners know (when someone else marked themselves out). */
export async function tellOwners(businessId: string, text: string, key: string) {
  await notifyStaff(businessId, null, "sickDay", text, key, () => true);
}
