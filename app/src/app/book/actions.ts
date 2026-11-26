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
import { formatDay, formatTime, isDateStr, parseHHMM, todayIn, toHHMM, zonedToUtc } from "@/lib/time/zone";
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

/** Open start times ("HH:MM", salon time) for the chosen services on a date. */
export async function getTimes(date: string, serviceIds: string[]): Promise<{ ok: true; times: string[] } | { ok: false; error: string }> {
  const b = await loadPublicBusiness();
  if (!b) return { ok: false, error: "Online booking isn't open yet." };
  if (!isDateStr(date) || !bookableDates(todayIn(b.timezone), b.hours, b.settings, await loadClosedChecker(b)).includes(date)) return { ok: false, error: "The salon is closed that day. Pick another day." };
  const services = await servicesFor(b.id, serviceIds);
  if (!services) return { ok: false, error: "Pick your services again." };
  const busy = await loadBusy(b, date);
  const times = availableStarts({ date, tz: b.timezone, hours: b.hours, services, busy, now: new Date(), settings: b.settings }).map(toHHMM);
  return { ok: true, times };
}

export interface OnlineBookingRequest {
  serviceIds: string[];
  date: string;
  time: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  agreed: boolean;
  /** Honeypot: real people leave this empty. */
  website?: string;
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
  const b = await loadPublicBusiness();
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

  // The time must still be open right now.
  const busy = await loadBusy(b, req.date);
  if (!availableStarts({ date: req.date, tz: b.timezone, hours: b.hours, services, busy, now: new Date(), settings: b.settings }).includes(minutes)) {
    return { ok: false, error: "That time was just taken. Please pick another." };
  }

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

  if (!clientId) {
    const { data, error } = await admin
      .from("clients")
      .insert({ business_id: b.id, first_name: firstName, last_name: lastName, phone, email, source: "online", sms_opt_in: true })
      .select("id")
      .single();
    if (error) return { ok: false, error: "Couldn't save your details. Please try again." };
    clientId = data.id as string;
  } else if (email && !match?.email) {
    await admin.from("clients").update({ email }).eq("id", clientId);
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
  const { error } = await admin.rpc("book_appointment", {
    p: {
      ...result.payload,
      business_id: b.id,
      client_id: clientId,
      staff_id: b.staffId,
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

