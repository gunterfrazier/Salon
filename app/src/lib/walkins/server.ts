import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBooking, toBookable, type BookableService, type ServiceRow } from "../booking/build";
import { phoneKey } from "../clients/import";
import { loadBusyRange, loadDaysOff } from "../data/schedule";
import type { Hours } from "../context";
import { NEW_CLIENT_STATE } from "../ui/standing";
import { asDoneBy, hoursFor, offersAll, STAFF_COLS, toStylists, type StaffRow, type Stylist } from "../staff/stylists";
import { addDays, parseHHMM, todayIn, wallParts, WEEKDAY_KEYS, weekday, zonedToUtc } from "../time/zone";
import { closureForDate, mergeHolidays } from "../schedule/holidays";
import { cleanWalkinSettings, periodStart, predictLine, turnWeight, waitLabel, type Prediction, type StylistState, type WalkinSettings } from "./engine";

export const walkinToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
const SVC_COLS = "id,key,name,price_type,price_cents,estimated_hours,active_min,processing_min,finish_min,deposit_category,stage,includes,is_add_on";

export interface LineBusiness {
  id: string;
  name: string;
  timezone: string;
  business_hours: Hours;
  holidays: unknown;
  walkin_settings: unknown;
}

export interface LineEntry {
  id: string;
  name: string;
  phone: string | null;
  services: string[];
  serviceIds: string[];
  requestedId: string | null;
  requestedName: string | null;
  source: string;
  joinedAt: string;
  minutes: number;
  token: string;
  /** Predicted: who and when. */
  staffId: string | null;
  staffName: string | null;
  start: number | null;
  wait: string;
}

export interface LineView {
  settings: WalkinSettings;
  now: number;
  waiting: LineEntry[];
  inChair: { id: string; name: string; staffName: string | null; startedAt: string; appointmentId: string | null }[];
  stylists: { id: string; name: string; inRotation: boolean; busyNow: boolean; turns: number; next: number | null; wait: string }[];
  anyone: { wait: string; staffName: string | null; start: number | null };
  prediction: Prediction;
}

/** Stylists who can take walk-ins who asked for anyone, per the salon's rule. */
function inRotation(s: WalkinSettings, st: Stylist, payType: string): boolean {
  if (s.who === "commission") return payType === "commission";
  if (s.who === "list") return s.list.includes(st.id);
  return true;
}

/** Services and their minutes for a walk-in (as the stylist does them, when known). */
async function servicesFor(db: SupabaseClient, businessId: string, serviceIds: string[]): Promise<BookableService[]> {
  if (!serviceIds.length) return [];
  const { data } = await db.from("services").select(SVC_COLS).eq("business_id", businessId).eq("archived", false).in("id", serviceIds);
  const byId = new Map(((data ?? []) as ServiceRow[]).map((r) => [r.id, r]));
  return serviceIds.filter((id) => byId.has(id)).map((id) => toBookable(byId.get(id)!));
}
const minutesOf = (svcs: BookableService[]) => Math.max(5, svcs.reduce((n, s) => n + s.active + s.processing + s.finish, 0) || 30);

/** The line right now: who's waiting, who's in the chair, predictions and waits. */
export async function loadLine(db: SupabaseClient, b: LineBusiness, nowDate = new Date()): Promise<LineView> {
  const settings = cleanWalkinSettings(b.walkin_settings);
  const tz = b.timezone;
  const now = nowDate.getTime();
  const today = todayIn(tz);
  const dayStartUtc = zonedToUtc(today, 0, tz);
  const dayEndUtc = zonedToUtc(addDays(today, 1), 0, tz);

  // Walk-ins whose appointment was checked out or cancelled are finished.
  const { data: active } = await db.from("walkins").select("id,status,appointment_id,appointments(status)").eq("business_id", b.id).eq("status", "in_service");
  for (const w of active ?? []) {
    const st = (w.appointments as unknown as { status: string } | null)?.status;
    if (st === "completed" || st === "cancelled" || st === "no_show") await db.from("walkins").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", w.id);
  }

  const [{ data: staffRows }, { data: pays }, { data: line }, { data: chair }, daysOff] = await Promise.all([
    db.from("staff").select(STAFF_COLS).eq("business_id", b.id),
    db.from("staff").select("id,pay_type").eq("business_id", b.id),
    db.from("walkins").select("id,name,phone,service_ids,requested_staff_id,source,joined_at,minutes,turn_weight,token").eq("business_id", b.id).eq("status", "waiting").order("joined_at"),
    db.from("walkins").select("id,name,staff_id,started_at,appointment_id").eq("business_id", b.id).eq("status", "in_service").order("started_at"),
    loadDaysOff(db, b.id, dayStartUtc, dayEndUtc),
  ]);
  const stylists = toStylists((staffRows ?? []) as StaffRow[]);
  const payOf = new Map((pays ?? []).map((p) => [p.id as string, p.pay_type as string]));
  const closed = closureForDate(today, tz, mergeHolidays(b.holidays as never), daysOff);
  const since = periodStart(settings.reset, today, weekday(today));
  const { data: turnRows } = await (since
    ? db.from("walkins").select("staff_id,turn_weight").eq("business_id", b.id).not("staff_id", "is", null).gte("started_at", zonedToUtc(since, 0, tz).toISOString())
    : db.from("walkins").select("staff_id,turn_weight").eq("business_id", b.id).not("staff_id", "is", null));
  const turns = new Map<string, number>();
  for (const r of turnRows ?? []) turns.set(r.staff_id as string, (turns.get(r.staff_id as string) ?? 0) + Number(r.turn_weight));

  const states: StylistState[] = await Promise.all(
    stylists.map(async (st) => {
      const h = hoursFor(st, b.business_hours)[WEEKDAY_KEYS[weekday(today)]];
      const working = !!h && !(closed && closed.kind !== "blocked_hours");
      const open = h ? zonedToUtc(today, parseHHMM(h[0]), tz).getTime() : 0;
      const end = h ? zonedToUtc(today, parseHHMM(h[1]), tz).getTime() : 0;
      const busy = (await loadBusyRange(db, b.id, st.id, nowDate, dayEndUtc)).map((x) => ({ start: x.start.getTime(), end: x.end.getTime() }));
      if (working && open > now) busy.push({ start: now, end: open });
      return { id: st.id, name: st.name, inRotation: inRotation(settings, st, payOf.get(st.id) ?? "none"), serviceIds: st.serviceIds, busy, dayEnd: working ? end : null, turns: turns.get(st.id) ?? 0 };
    }),
  );

  const allIds = [...new Set((line ?? []).flatMap((w) => (w.service_ids as string[]) ?? []))];
  const { data: names } = allIds.length ? await db.from("services").select("id,name").in("id", allIds) : { data: [] };
  const svcName = new Map((names ?? []).map((n) => [n.id as string, n.name as string]));
  const nameOf = (id: string | null) => (id ? (stylists.find((s) => s.id === id)?.name.split(" ")[0] ?? null) : null);

  const prediction = predictLine(states, (line ?? []).map((w) => ({ id: w.id as string, requested: (w.requested_staff_id as string | null) ?? null, serviceIds: (w.service_ids as string[]) ?? [], minutes: w.minutes as number, weight: Number(w.turn_weight) || 1 })), settings, now);
  const busyNow = (st: StylistState) => st.busy.some((x) => x.start <= now && now < x.end);

  return {
    settings,
    now,
    waiting: (line ?? []).map((w) => {
      const p = prediction.people.find((x) => x.id === w.id);
      return {
        id: w.id as string,
        name: w.name as string,
        phone: (w.phone as string | null) ?? null,
        services: ((w.service_ids as string[]) ?? []).map((id) => svcName.get(id) ?? "Service"),
        serviceIds: (w.service_ids as string[]) ?? [],
        requestedId: (w.requested_staff_id as string | null) ?? null,
        requestedName: nameOf((w.requested_staff_id as string | null) ?? null),
        source: w.source as string,
        joinedAt: w.joined_at as string,
        minutes: w.minutes as number,
        token: w.token as string,
        staffId: p?.staffId ?? null,
        staffName: nameOf(p?.staffId ?? null),
        start: p?.start ?? null,
        wait: waitLabel(p?.start ?? null, now),
      };
    }),
    inChair: (chair ?? []).map((w) => ({ id: w.id as string, name: w.name as string, staffName: nameOf((w.staff_id as string | null) ?? null), startedAt: w.started_at as string, appointmentId: (w.appointment_id as string | null) ?? null })),
    stylists: states
      .filter((st) => st.dayEnd !== null)
      .map((st) => {
        const next = prediction.stylists.find((x) => x.id === st.id)?.next ?? null;
        return { id: st.id, name: st.name, inRotation: st.inRotation, busyNow: busyNow(st), turns: st.turns, next, wait: waitLabel(next, now) };
      }),
    anyone: { wait: waitLabel(prediction.anyone.start, now), staffName: nameOf(prediction.anyone.staffId), start: prediction.anyone.start },
    prediction,
  };
}

/** Find a client by phone (or make a new one) for a walk-in. */
async function clientFor(db: SupabaseClient, businessId: string, name: string, phone: string | null): Promise<string | null> {
  const key = phoneKey(phone);
  if (key.length === 10) {
    const { data } = await db.from("clients").select("id,phone").eq("business_id", businessId).ilike("phone", `%${key.slice(-4)}`).limit(200);
    const hit = (data ?? []).find((c) => phoneKey(c.phone as string) === key);
    if (hit) return hit.id as string;
  }
  const [first, ...rest] = name.trim().split(/\s+/);
  const { data, error } = await db.from("clients").insert({ business_id: businessId, first_name: first, last_name: rest.join(" ") || null, phone, source: "manual" }).select("id").single();
  return error ? null : (data.id as string);
}

export interface JoinInput {
  name: string;
  phone: string | null;
  serviceIds: string[];
  requested: string | null;
  source: "desk" | "kiosk" | "online";
}

/** Add someone to the line. Returns their id and status-link token. */
export async function joinLine(db: SupabaseClient, b: LineBusiness, i: JoinInput): Promise<{ ok: true; id: string; token: string } | { ok: false; error: string }> {
  const settings = cleanWalkinSettings(b.walkin_settings);
  if (settings.mode === "off") return { ok: false, error: "This salon isn't taking walk-ins right now." };
  if (i.source === "online" && !settings.joinOnline) return { ok: false, error: "Joining the line online isn't on for this salon." };
  const name = i.name.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!name) return { ok: false, error: "Enter a name." };
  const phone = i.phone?.trim() ? i.phone.trim().slice(0, 40) : null;
  if (phone && phoneKey(phone).length < 10) return { ok: false, error: "Enter a 10-digit mobile number, or leave it blank." };
  if (i.source === "online" && !phone) return { ok: false, error: "Enter your mobile number so the salon can reach you." };
  const svcs = await servicesFor(db, b.id, i.serviceIds.slice(0, 6));
  const { data: staffRows } = await db.from("staff").select(STAFF_COLS).eq("business_id", b.id);
  const stylists = toStylists((staffRows ?? []) as StaffRow[]);
  const requested = i.requested ? stylists.find((s) => s.id === i.requested) ?? null : null;
  if (i.requested && !requested) return { ok: false, error: "That stylist isn't available. Pick another, or anyone." };
  if (requested && svcs.length && !offersAll(requested, svcs.map((s) => s.id))) return { ok: false, error: `${requested.name.split(" ")[0]} doesn't do all of those services.` };
  // A phone already waiting: don't add them twice.
  if (phone) {
    const { data: dup } = await db.from("walkins").select("id,token,phone").eq("business_id", b.id).eq("status", "waiting");
    const same = (dup ?? []).find((w) => phoneKey(w.phone as string) === phoneKey(phone));
    if (same) return { ok: true, id: same.id as string, token: same.token as string };
  }
  const clientId = await clientFor(db, b.id, name, phone);
  const minutes = minutesOf(requested ? asDoneBy(svcs, requested) : svcs);
  const price = svcs.reduce((n, s) => n + Math.round(s.price * 100), 0);
  const token = walkinToken();
  const { data, error } = await db
    .from("walkins")
    .insert({ business_id: b.id, client_id: clientId, name, phone, service_ids: svcs.map((s) => s.id), requested_staff_id: requested?.id ?? null, source: i.source, minutes, turn_weight: turnWeight(settings, minutes, price), token })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't add to the line. Try again." };
  return { ok: true, id: data.id as string, token };
}

/**
 * Start a walk-in's service with a stylist (the predicted one unless the desk
 * picks another): an appointment from now, in the chair, so checkout works as
 * usual. Their turn counts from here.
 */
export async function startWalkin(db: SupabaseClient, b: LineBusiness & { policy_settings: unknown; pricing_rules: { bundles?: unknown[] } }, walkinId: string, staffId: string | null): Promise<{ ok: true; appointmentId: string; staffName: string } | { ok: false; error: string }> {
  const settings = cleanWalkinSettings(b.walkin_settings);
  const { data: w } = await db.from("walkins").select("id,client_id,name,phone,service_ids,requested_staff_id,minutes,status").eq("id", walkinId).eq("business_id", b.id).maybeSingle();
  if (!w || w.status !== "waiting") return { ok: false, error: "They're not waiting anymore. Refresh." };
  const view = await loadLine(db, b);
  const chosen = staffId ?? view.waiting.find((x) => x.id === walkinId)?.staffId ?? (w.requested_staff_id as string | null);
  const { data: staffRows } = await db.from("staff").select(STAFF_COLS).eq("business_id", b.id);
  const st = toStylists((staffRows ?? []) as StaffRow[]).find((s) => s.id === chosen);
  if (!st) return { ok: false, error: "Pick who's taking them." };
  let svcs = asDoneBy(await servicesFor(db, b.id, (w.service_ids as string[]) ?? []), st);
  if (!svcs.length) {
    // No service picked yet: hold their time as a 30-minute visit; the stylist adds services at checkout.
    const { data: any } = await db.from("services").select(SVC_COLS).eq("business_id", b.id).eq("archived", false).order("sort").limit(1);
    if (!any?.length) return { ok: false, error: "Add services to the menu first." };
    svcs = [{ ...toBookable(any[0] as ServiceRow), active: w.minutes as number, processing: 0, finish: 0 }];
  }
  let clientId = w.client_id as string | null;
  if (!clientId) clientId = await clientFor(db, b.id, w.name as string, (w.phone as string | null) ?? null);
  if (!clientId) return { ok: false, error: "Couldn't save the client." };
  const nowMin = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const built = buildBooking({ services: svcs, start: nowMin, rules: (b.pricing_rules.bundles ?? []) as never, policy: b.policy_settings as never, client: NEW_CLIENT_STATE, now: new Date(), depositOverride: "waive" });
  const { data: apptId, error } = await db.rpc("book_appointment", {
    p: { business_id: b.id, client_id: clientId, staff_id: st.id, start_at: built.payload.start_at, end_at: built.payload.end_at, booked_via: "walkin", deposit_required_cents: 0, allow_overlap: true, notes: "Walk-in", services: built.payload.services },
  });
  if (error || !apptId) return { ok: false, error: `Couldn't start: ${error?.message ?? "unknown"}` };
  await db.from("appointments").update({ status: "in_service" }).eq("id", apptId as string);
  const price = built.payload.services.reduce((n, l) => n + l.price_quoted_cents, 0);
  const minutes = Math.round((Date.parse(built.payload.end_at) - Date.parse(built.payload.start_at)) / 60_000);
  await db.from("walkins").update({ status: "in_service", staff_id: st.id, started_at: new Date().toISOString(), appointment_id: apptId as string, client_id: clientId, minutes, turn_weight: turnWeight(settings, minutes, price) }).eq("id", walkinId);
  return { ok: true, appointmentId: apptId as string, staffName: st.name.split(" ")[0] };
}

export const nowParts = (tz: string) => wallParts(new Date(), tz);

/** A salon's line by its web address (public pages), or null. */
export async function lineBusinessBySlug(db: SupabaseClient, slug: string): Promise<(LineBusiness & { slug: string; phone: string | null; branding: unknown }) | null> {
  const { data } = await db.from("businesses").select("id,name,slug,phone,timezone,business_hours,holidays,walkin_settings,branding").eq("slug", slug.toLowerCase()).eq("status", "approved").maybeSingle();
  return data ? (data as unknown as LineBusiness & { slug: string; phone: string | null; branding: unknown }) : null;
}

/** A walk-in by their status link, with the salon. */
export async function walkinByToken(db: SupabaseClient, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data: w } = await db.from("walkins").select("id,business_id,name,status,staff_id,requested_staff_id,joined_at,token").eq("token", token).maybeSingle();
  if (!w) return null;
  const { data: b } = await db.from("businesses").select("id,name,slug,phone,timezone,business_hours,holidays,walkin_settings,branding").eq("id", w.business_id).single();
  return b ? { w, b: b as unknown as LineBusiness & { slug: string; phone: string | null; branding: unknown } } : null;
}

/**
 * Run by the 5-minute job: tell each person in a walk-in line when they're
 * about 10 minutes from the front (once).
 */
export async function runWalkinNotices(db: SupabaseClient, now = new Date()): Promise<{ sent: number }> {
  const { data: rows } = await db.from("businesses").select("id,name,slug,timezone,business_hours,holidays,walkin_settings").in("walkin_settings->>mode", ["both", "only"]);
  const { notifyWalkinNext } = await import("../notify/events");
  const site = (process.env.SITE_URL ?? "https://chairvana.app").replace(/\/$/, "");
  let sent = 0;
  for (const b of rows ?? []) {
    const { data: waiting } = await db.from("walkins").select("id").eq("business_id", b.id).eq("status", "waiting").is("notified_at", null).limit(1);
    if (!waiting?.length) continue;
    const line = await loadLine(db, b as unknown as LineBusiness, now);
    for (const w of line.waiting) {
      if (w.start === null || w.start - now.getTime() > 10 * 60_000) continue;
      const { data: row } = await db.from("walkins").update({ notified_at: now.toISOString() }).eq("id", w.id).is("notified_at", null).select("client_id").maybeSingle();
      if (!row?.client_id) continue;
      const r = await notifyWalkinNext(b.id as string, row.client_id as string, w.id, `${site}/w/${w.token}`);
      if (r.sent) sent++;
    }
  }
  return { sent };
}
