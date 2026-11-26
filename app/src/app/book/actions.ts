"use server";

import { headers } from "next/headers";
import { availableStarts, bookableDates } from "@/lib/booking/availability";
import { buildBooking, toBookable } from "@/lib/booking/build";
import { phoneKey } from "@/lib/clients/import";
import { loadClientStates, reviveClientState } from "@/lib/data/clients";
import { loadBusy, loadClosedChecker, loadPublicBusiness, loadPublicServices } from "@/lib/data/public-booking";
import { paymentRequest } from "@/lib/payments/methods";
import { depositMethods, mergeMethods } from "@/lib/payments/settings";
import { policyText, policyVersion } from "@/lib/policy/text";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, formatDay, formatTime, isDateStr, parseHHMM, todayIn, toHHMM, zonedToUtc } from "@/lib/time/zone";
import { blockRange, cleanFavorites, type Opening, type SearchCriteria } from "@/lib/booking/search";
import { hoursFor, whoOffers, type Stylist } from "@/lib/staff/stylists";
import type { BookableService } from "@/lib/booking/build";
import type { PublicBusiness, PublicService } from "@/lib/data/public-booking";
import { salonOpenings } from "@/lib/discovery/openings";
import { notifyAppointment, notifyStaff } from "@/lib/notify/events";
import { cleanEntry } from "@/lib/data/waitlist";
import { describeWindow } from "@/lib/waitlist/match";
import { whoAmI } from "@/lib/auth/whoami";

import { NEW_CLIENT_STATE } from "@/lib/ui/standing";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (s: unknown, max = 200) => (typeof s === "string" ? s.trim().slice(0, max) : "") || null;

async function servicesFor(businessId: string, ids: string[]) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 8) return null;
  const all = await loadPublicServices(businessId);
  const byId = new Map(all.map((s) => [s.id, s]));
  if (ids.some((id) => !byId.has(id)) || new Set(ids).size !== ids.length) return null;
  return ids.map((id) => toBookable(byId.get(id)!));
}

/** Stylists who can do these services: one chosen stylist, or everyone who offers them ("any"). */
function eligible(b: PublicBusiness, serviceIds: string[], staffId: string | null | undefined): Stylist[] {
  const able = whoOffers(b.stylists, serviceIds);
  return staffId && staffId !== "any" ? able.filter((s) => s.id === staffId) : able;
}

/** Open start minutes for one stylist on a date. */
async function stylistStarts(b: PublicBusiness, s: Stylist, date: string, services: BookableService[]): Promise<number[]> {
  const busy = await loadBusy(b, date, s.id);
  return availableStarts({ date, tz: b.timezone, hours: hoursFor(s, b.hours), services, busy, now: new Date(), settings: b.settings });
}

/** Open start times ("HH:MM", salon time) for the chosen services on a date, with one stylist or anyone. */
export async function getTimes(salon: string, date: string, serviceIds: string[], staffId?: string | null): Promise<{ ok: true; times: string[] } | { ok: false; error: string }> {
  const b = await loadPublicBusiness({ slug: salon });
  if (!b) return { ok: false, error: "Online booking isn't open yet." };
  if (!isDateStr(date) || !bookableDates(todayIn(b.timezone), b.hours, b.settings, await loadClosedChecker(b)).includes(date)) return { ok: false, error: "The salon is closed that day. Pick another day." };
  const services = await servicesFor(b.id, serviceIds);
  if (!services) return { ok: false, error: "Pick your services again." };
  const who = eligible(b, serviceIds, staffId);
  if (!who.length) return { ok: false, error: "No one offers all of these services. Try fewer services or another stylist." };
  const all = new Set<number>();
  for (const s of who) for (const m of await stylistStarts(b, s, date, services)) all.add(m);
  return { ok: true, times: [...all].sort((x, y) => x - y).map(toHHMM) };
}

export interface OnlineBookingRequest {
  /** The salon's web address (slug). */
  salon: string;
  serviceIds: string[];
  /** A stylist's id, or "any" / empty for whoever is free. */
  staffId?: string | null;
  date: string;
  time: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  agreed: boolean;
  /** Ticked "Text me about my appointments" (unticked by default). */
  textOk?: boolean;
  /** Honeypot: real people leave this empty. */
  website?: string;
  /** "Remember my favorites": saved on the client record. */
  favorites?: unknown;
}

export type OnlineBookingResult =
  | {
      ok: true;
      when: string;
      services: string[];
      total: number;
      priceMayVary: boolean;
      deposit: number;
      status: "booked" | "pending";
      payWith: { label: string; url: string | null; instructions: string }[];
    }
  | { ok: false; error: string };

export async function submitOnlineBooking(req: OnlineBookingRequest): Promise<OnlineBookingResult> {
  if (req.website) return { ok: false, error: "Something went wrong. Please try again." };
  const b = await loadPublicBusiness({ slug: req.salon });
  if (!b) return { ok: false, error: "Online booking isn't open yet." };

  const firstName = clean(req.firstName, 100);
  const lastName = clean(req.lastName, 100);
  const email = clean(req.email, 200)?.toLowerCase() ?? null;
  const phone = clean(req.phone, 40);
  if (!firstName || !lastName) return { ok: false, error: "Enter your first and last name." };
  if (!phone || phoneKey(phone).length < 10) return { ok: false, error: "Enter a mobile number we can text." };
  if (email && !EMAIL.test(email)) return { ok: false, error: "That email doesn't look right." };
  if (!req.agreed) return { ok: false, error: "Please agree to the booking policy." };

  if (!isDateStr(req.date) || !bookableDates(todayIn(b.timezone), b.hours, b.settings, await loadClosedChecker(b)).includes(req.date)) return { ok: false, error: "The salon is closed that day. Pick another day." };
  let minutes: number;
  try {
    minutes = parseHHMM(req.time);
  } catch {
    return { ok: false, error: "Pick a time." };
  }
  const services = await servicesFor(b.id, req.serviceIds);
  if (!services) return { ok: false, error: "Pick your services again." };

  // The time must still be open right now, with the chosen stylist or anyone who offers the services.
  let stylist: Stylist | null = null;
  for (const s of eligible(b, req.serviceIds, req.staffId)) {
    if ((await stylistStarts(b, s, req.date, services)).includes(minutes)) {
      stylist = s;
      break;
    }
  }
  if (!stylist) return { ok: false, error: "That time was just taken. Please pick another." };

  const admin = createAdminClient();

  // Returning client? Match on phone, then email.
  const { data: candidates } = await admin.from("clients").select("id,phone,email").eq("business_id", b.id).limit(10000);
  const key = phoneKey(phone);
  const match = (candidates ?? []).find((c) => phoneKey(c.phone) === key) ?? (email ? (candidates ?? []).find((c) => (c.email ?? "").toLowerCase() === email) : undefined);

  let clientId = match?.id as string | undefined;
  let state = NEW_CLIENT_STATE;
  if (clientId) {
    const states = await loadClientStates(admin, b.id, [clientId]);
    if (states[clientId]) state = reviveClientState(states[clientId]);
    if (state.outstandingBalance > 0) return { ok: false, error: "There's an unpaid balance on your account. Please contact the salon to book." };
  }

  const result = buildBooking({ services, start: zonedToUtc(req.date, minutes, b.timezone), rules: b.rules, policy: b.policy, client: state, now: new Date() });
  if (result.errors.length) return { ok: false, error: result.errors[0] };

  // Signed in with a customer account? This salon's record joins it.
  const who = await whoAmI().catch(() => null);
  const customerId = who?.kind === "customer" ? who.customerId : null;

  if (!clientId) {
    const { data, error } = await admin
      .from("clients")
      .insert({ business_id: b.id, first_name: firstName, last_name: lastName, phone, email, source: "online", sms_opt_in: req.textOk === true, preferences: cleanFavorites(req.favorites) ?? {}, customer_id: customerId && who?.kind === "customer" && email === (who.user.email ?? "").toLowerCase() ? customerId : null })
      .select("id")
      .single();
    if (error) return { ok: false, error: "Couldn't save your details. Please try again." };
    clientId = data.id as string;
  } else {
    const patch: Record<string, unknown> = {};
    if (email && !match?.email) patch.email = email;
    if (req.textOk === true) patch.sms_opt_in = true;
    if (customerId && who?.kind === "customer") {
      // Only claim this salon's record when it carries the customer's own verified email
      // (a phone match alone could be someone else's record).
      const { data: rec } = await admin.from("clients").select("customer_id,email").eq("id", clientId).single();
      const mine = !!rec?.email && rec.email.toLowerCase() === (who.user.email ?? "").toLowerCase() && !!who.user.email_confirmed_at;
      if (!rec?.customer_id && mine) patch.customer_id = customerId;
    }
    const fav = cleanFavorites(req.favorites);
    if (fav) patch.preferences = fav;
    if (Object.keys(patch).length) await admin.from("clients").update(patch).eq("id", clientId);
  }

  const h = await headers();
  const lines = policyText(b.policy);
  const { data: consent, error: consentErr } = await admin
    .from("policy_consents")
    .insert({
      business_id: b.id,
      client_id: clientId,
      policy_version: policyVersion(lines),
      policy_text: lines.join("\n"),
      ip: (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || null,
      user_agent: h.get("user-agent")?.slice(0, 500) ?? null,
    })
    .select("id")
    .single();
  if (consentErr) return { ok: false, error: "Couldn't save your booking. Please try again." };

  const deposit = result.depositCents;
  const status = deposit > 0 ? "pending" : "booked";
  const { data: newId, error } = await admin.rpc("book_appointment", {
    p: {
      ...result.payload,
      business_id: b.id,
      client_id: clientId,
      staff_id: stylist.id,
      booked_via: "online",
      status,
      notes: clean(req.notes, 1000),
      policy_consent_id: consent.id,
    },
  });
  if (error) {
    if (error.code === "23P01") return { ok: false, error: "That time was just taken. Please pick another." };
    return { ok: false, error: "Couldn't save your booking. Please try again." };
  }
  await notifyAppointment(b.id, newId as string, "booked_online");

  const when = `${formatDay(req.date, { weekday: "long", month: "long", day: "numeric" })} at ${formatTime(result.plan.start, b.timezone)}`;
  const note = `Deposit ${formatDay(req.date, { month: "short", day: "numeric" })} ${firstName} ${lastName}`;
  const payWith =
    deposit > 0
      ? depositMethods(mergeMethods(b.paymentMethods)).map((m) => {
          const r = paymentRequest(m, deposit, note);
          return { label: m.label, url: r.url, instructions: r.instructions };
        })
      : [];

  return {
    ok: true,
    when,
    services: services.map((s) => s.name),
    total: result.priced.total,
    priceMayVary: result.plan.priceMayVary,
    deposit,
    status,
    payWith,
  };
}


/** Public "Find a time": openings matching days / time of day / when. */
export async function findPublicOpenings(salon: string, serviceIds: string[], criteria: SearchCriteria, staffId?: string | null): Promise<{ ok: true; openings: Opening[] } | { ok: false; error: string }> {
  const b = await loadPublicBusiness({ slug: salon });
  if (!b) return { ok: false, error: "Online booking isn't open yet." };
  if (!Array.isArray(serviceIds) || serviceIds.length === 0 || serviceIds.length > 8) return { ok: false, error: "Pick your services again." };
  const menu = await loadPublicServices(b.id);
  const services = serviceIds.map((id) => menu.find((m) => m.id === id));
  if (services.some((x) => !x)) return { ok: false, error: "Pick your services again." };
  if (!eligible(b, serviceIds, staffId).length) return { ok: false, error: "No one offers all of these services. Try fewer services or another stylist." };
  const openings = await salonOpenings(b, services as PublicService[], criteria, staffId);
  return { ok: true, openings };
}

export interface WaitlistJoinRequest {
  salon: string;
  serviceIds: string[];
  staffId?: string | null;
  weekdays: number[];
  block: SearchCriteria["block"];
  weeks: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  textOk?: boolean;
  website?: string;
}

/** "Join the waitlist" from online booking. */
export async function joinWaitlistOnline(req: WaitlistJoinRequest): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  if (req.website) return { ok: false, error: "Something went wrong. Please try again." };
  const b = await loadPublicBusiness({ slug: req.salon });
  if (!b) return { ok: false, error: "Online booking isn't open yet." };
  const firstName = clean(req.firstName, 100);
  const lastName = clean(req.lastName, 100);
  const email = clean(req.email, 200)?.toLowerCase() ?? null;
  const phone = clean(req.phone, 40);
  if (!firstName || !lastName) return { ok: false, error: "Enter your first and last name." };
  if (!phone || phoneKey(phone).length < 10) return { ok: false, error: "Enter your mobile number." };
  if (email && !EMAIL.test(email)) return { ok: false, error: "That email doesn't look right." };
  if (!req.textOk && !email) return { ok: false, error: "Tick “Text me” or add your email so we can let you know." };
  const services = await servicesFor(b.id, req.serviceIds);
  if (!services) return { ok: false, error: "Pick your services again." };
  const staffId = req.staffId && req.staffId !== "any" ? req.staffId : null;
  if (!eligible(b, req.serviceIds, staffId).length) return { ok: false, error: "No one offers all of those services together." };
  const weeks = [1, 2, 4, 6, 8].includes(req.weeks) ? req.weeks : 4;
  const [timeFrom, timeTo] = blockRange(req.block);
  const today = todayIn(b.timezone);
  const c = cleanEntry({ serviceIds: req.serviceIds, weekdays: req.weekdays, timeFrom, timeTo, dateFrom: today, dateTo: addDays(today, weeks * 7), note: req.notes }, today);
  if (!c.ok) return c;

  const admin = createAdminClient();
  const { data: candidates } = await admin.from("clients").select("id,phone,email").eq("business_id", b.id).limit(10000);
  const key = phoneKey(phone);
  const match = (candidates ?? []).find((x) => phoneKey(x.phone) === key) ?? (email ? (candidates ?? []).find((x) => (x.email ?? "").toLowerCase() === email) : undefined);
  let clientId = match?.id as string | undefined;
  if (!clientId) {
    const { data, error } = await admin.from("clients").insert({ business_id: b.id, first_name: firstName, last_name: lastName, phone, email, source: "online", sms_opt_in: req.textOk === true }).select("id").single();
    if (error) return { ok: false, error: "Couldn't save your details. Please try again." };
    clientId = data.id as string;
  } else {
    const patch: Record<string, unknown> = {};
    if (email && !match?.email) patch.email = email;
    if (req.textOk === true) patch.sms_opt_in = true;
    if (Object.keys(patch).length) await admin.from("clients").update(patch).eq("id", clientId);
  }

  const { count } = await admin.from("waitlist").select("id", { count: "exact", head: true }).eq("business_id", b.id).eq("client_id", clientId).eq("status", "active");
  if ((count ?? 0) >= 3) return { ok: false, error: "You're already on the waitlist three times here. Contact the salon to change it." };
  const { error } = await admin.from("waitlist").insert({ business_id: b.id, client_id: clientId, staff_id: staffId, source: "online", ...c.v });
  if (error) return { ok: false, error: "Couldn't add you to the waitlist. Please try again." };

  const window = describeWindow({ weekdays: c.v.weekdays, timeFrom: c.v.time_from, timeTo: c.v.time_to, dateFrom: c.v.date_from, dateTo: c.v.date_to });
  const what = services.map((s) => s.name).join(" + ");
  const who = staffId ? b.stylists.find((s) => s.id === staffId)?.name : null;
  await notifyStaff(b.id, staffId, "stylistWaitlist", `${firstName} ${lastName} joined the waitlist: ${what}${who ? ` with ${who}` : ""} · ${window}.`, `waitlist-joined:${clientId}:${c.v.date_from}:${c.v.service_ids.join(",")}`, (s) => s.stylist.waitlistJoined?.enabled !== false);
  return { ok: true, summary: `${what}${who ? ` with ${who}` : ""} · ${window}` };
}
