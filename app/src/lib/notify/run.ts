import { OPTED_OUT_ERROR } from "./inbound";
import { setTextingFor } from "./optout";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientStanding } from "../policy/flags";
import type { PolicySettings } from "../policy/types";
import { reviveClientState } from "../data/clients-shared";
import { loadClientStates } from "../data/clients";
import { addDays, zonedToUtc } from "../time/zone";
import { afterQuiet, dayPreviewDue, dueReminders, holdActions, type NotifyAppt } from "./engine";
import { clientRows, dayPreviewText, stylistRow, type ApptInfo, type MessageRow, type Recipient, type SalonInfo } from "./outbox";
import type { Sender } from "./provider";
import { hasPushDevice, pushToStaff } from "../push/server";
import { loadProducts } from "../data/inventory";
import { stockLevel } from "../inventory/stock";
import { mergeNotificationSettings, type NotificationSettings } from "./settings";
import { waitlistOffers } from "../waitlist/run";

const OPEN = ["pending", "booked", "confirmed"];
const HORIZON_DAYS = 15;
/** Queued messages older than this are dropped rather than sent late. */
const STALE_HOURS = 6;

interface ApptRow {
  id: string;
  staff_id: string;
  client_id: string;
  start_at: string;
  status: string;
  created_at: string;
  deposit_required_cents: number;
  clients: { first_name: string; last_name: string | null; phone: string | null; email: string | null; sms_opt_in: boolean } | null;
  appointment_services: { sort: number; services: { name: string } | null }[];
}

interface Loaded {
  rows: ApptRow[];
  paid: Record<string, number>;
}

const SELECT = "id,staff_id,client_id,start_at,status,created_at,deposit_required_cents,clients(first_name,last_name,phone,email,sms_opt_in),appointment_services(sort,services(name))";

async function loadAppts(db: SupabaseClient, businessId: string, from: Date, to: Date, statuses = OPEN): Promise<Loaded> {
  const { data, error } = await db
    .from("appointments")
    .select(SELECT)
    .eq("business_id", businessId)
    .in("status", statuses)
    .gte("start_at", from.toISOString())
    .lt("start_at", to.toISOString())
    .order("start_at");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ApptRow[];
  const paid: Record<string, number> = {};
  if (rows.length) {
    const { data: pays, error: e2 } = await db
      .from("payments")
      .select("appointment_id,amount_cents")
      .eq("kind", "deposit")
      .eq("status", "succeeded")
      .in("appointment_id", rows.map((r) => r.id));
    if (e2) throw new Error(e2.message);
    for (const p of pays ?? []) paid[p.appointment_id] = (paid[p.appointment_id] ?? 0) + p.amount_cents;
  }
  return { rows, paid };
}

const toNotify = (r: ApptRow, paid: Record<string, number>): NotifyAppt => ({
  id: r.id,
  clientId: r.client_id,
  start: new Date(r.start_at),
  status: r.status,
  createdAt: new Date(r.created_at),
  depositDue: Math.max(0, r.deposit_required_cents - (paid[r.id] ?? 0)),
});

const toInfo = (r: ApptRow, paid: Record<string, number>): ApptInfo => ({
  id: r.id,
  start: new Date(r.start_at),
  services: [...r.appointment_services].sort((a, b) => a.sort - b.sort).map((s) => s.services?.name ?? "Service"),
  depositDue: Math.max(0, r.deposit_required_cents - (paid[r.id] ?? 0)),
});

const toRecipient = (r: ApptRow): Recipient => ({
  clientId: r.client_id,
  firstName: r.clients?.first_name ?? "",
  phone: r.clients?.phone ?? null,
  email: r.clients?.email ?? null,
  smsOptIn: !!r.clients?.sms_opt_in,
});

const clientName = (r: ApptRow) => [r.clients?.first_name, r.clients?.last_name].filter(Boolean).join(" ") || "Client";

export interface Business {
  salon: SalonInfo;
  settings: NotificationSettings;
  policy: PolicySettings;
  /** The owner: gets salon-wide alerts and covers anyone without contact details. */
  staff: Contact;
  /** Everyone active on the team, by staff id. */
  team: Map<string, Contact & { name: string; bookable: boolean }>;
}

type Contact = { id?: string; phone: string | null; email: string | null; push?: boolean };

/** Where an alert about one stylist's appointment goes: that stylist, else the owner. */
export function contactFor(b: Business, staffId: string | null | undefined): Contact {
  const m = staffId ? b.team.get(staffId) : undefined;
  return m && (m.phone || m.email || m.push) ? m : b.staff;
}

export async function loadBusinesses(db: SupabaseClient, siteUrl: string, onlyId?: string): Promise<Business[]> {
  let q = db.from("businesses").select("id,slug,name,timezone,notification_settings,payment_methods,policy_settings");
  if (onlyId) q = q.eq("id", onlyId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const out: Business[] = [];
  for (const b of data ?? []) {
    const { data: staff } = await db.from("staff").select("id,display_name,phone,email,role,bookable").eq("business_id", b.id).eq("active", true).order("created_at");
    const owner = (staff ?? []).find((s) => s.role === "owner") ?? staff?.[0];
    const team = new Map<string, Contact & { name: string; bookable: boolean }>();
    for (const m of staff ?? []) team.set(m.id, { id: m.id, name: m.display_name, phone: m.phone, email: m.email, bookable: m.bookable, push: await hasPushDevice(db, m.id) });
    out.push({
      salon: { id: b.id, slug: b.slug, name: b.name, timezone: b.timezone, paymentMethods: b.payment_methods, siteUrl },
      settings: mergeNotificationSettings(b.notification_settings),
      policy: b.policy_settings,
      staff: owner ? team.get(owner.id)! : { phone: null, email: null },
      team,
    });
  }
  return out;
}

/** Adds rows to the outbox; rows whose dedupe key was already used are ignored. */
export async function queueRows(db: SupabaseClient, rows: MessageRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db.from("messages").upsert(rows, { onConflict: "business_id,dedupe_key,channel", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

async function usedKeys(db: SupabaseClient, businessId: string, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const { data, error } = await db.from("messages").select("dedupe_key").eq("business_id", businessId).in("dedupe_key", keys);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.dedupe_key as string));
}

export interface RunSummary {
  queued: number;
  released: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Decide what's due for one salon and put it in the outbox. Safe to run any number of times. */
export async function scheduleBusiness(db: SupabaseClient, b: Business, now: Date): Promise<{ queued: number; released: number }> {
  const { salon, settings: s } = b;
  const tz = salon.timezone;
  const { rows, paid } = await loadAppts(db, salon.id, now, new Date(now.getTime() + HORIZON_DAYS * 86_400_000));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const notify = rows.map((r) => toNotify(r, paid));
  const out: MessageRow[] = [];
  let released = 0;

  // Keys this run could produce, to look up which are already used.
  const candidateKeys = notify.flatMap((a) => [
    ...s.client.reminders.map((r) => `reminder:${a.id}:${r.id}:${a.start.toISOString()}`),
    `hold-remind:${a.id}`,
    `before-each:${a.id}:${a.start.toISOString()}`,
  ]);
  const used = await usedKeys(db, salon.id, candidateKeys);

  for (const p of dueReminders(notify, used, s, tz, now)) {
    const r = byId.get(p.apptId)!;
    out.push(...clientRows({ salon, settings: s, to: toRecipient(r), appt: toInfo(r, paid), template: "reminder", channels: p.channels, key: p.key, sendAfter: now }));
  }

  for (const h of holdActions(notify, used, s, now)) {
    const r = byId.get(h.appt.id)!;
    if (h.kind === "remind") {
      if (s.client.depositRequest.enabled) out.push(...clientRows({ salon, settings: s, to: toRecipient(r), appt: toInfo(r, paid), template: "depositReminder", channels: s.client.depositRequest.channels ?? ["sms"], key: h.key, sendAfter: now }));
      continue;
    }
    const { data: ok, error } = await db.rpc("release_pending_hold", { appointment: r.id });
    if (error) throw new Error(error.message);
    if (!ok) continue; // deposit arrived or it was already closed
    released++;
    out.push(...clientRows({ salon, settings: s, to: toRecipient(r), appt: toInfo(r, paid), template: "holdReleased", channels: s.client.cancel.enabled ? (s.client.cancel.channels ?? ["sms"]) : [], key: h.key, sendAfter: now }));
    if (s.stylist.changeOrCancel.enabled) {
      const info = toInfo(r, paid);
      out.push(stylistRow({ salon, staff: contactFor(b, r.staff_id), template: "stylistHoldReleased", body: `Released: ${clientName(r)}'s ${info.services.join(", ")} on ${dayPreviewDateTime(info.start, tz)}. No deposit arrived.`, apptId: r.id, key: `${h.key}:stylist`, sendAfter: now }));
    }
  }

  if (s.stylist.beforeEach.enabled) {
    for (const a of notify) {
      if (a.status === "pending") continue;
      const at = a.start.getTime() - s.stylist.beforeEach.minutes * 60_000;
      const key = `before-each:${a.id}:${a.start.toISOString()}`;
      if (at <= now.getTime() && !used.has(key)) {
        const r = byId.get(a.id)!;
        out.push(stylistRow({ salon, staff: contactFor(b, r.staff_id), template: "stylistBeforeEach", body: `Next: ${clientName(r)} at ${dayPreviewDateTime(a.start, tz)}: ${toInfo(r, paid).services.join(", ")}`, apptId: a.id, key, sendAfter: now }));
      }
    }
  }

  const previewDay = dayPreviewDue(s, tz, now, null);
  if (previewDay) {
    // Who gets one: each stylist (their own day), plus the owner for the whole salon if they don't take appointments.
    const recipients = [...b.team.values()].filter((m) => m.bookable).map((m) => ({ contact: m as Contact, staffId: m.id as string | null }));
    if (b.staff.id && !b.team.get(b.staff.id)?.bookable) recipients.push({ contact: b.staff, staffId: null });
    const keys = recipients.map((r) => `day-preview:${r.staffId ?? "salon"}:${previewDay}`);
    const used = await usedKeys(db, salon.id, keys);
    const todo = recipients.filter((_, i) => !used.has(keys[i]));
    if (todo.length) {
      const day = await loadAppts(db, salon.id, zonedToUtc(previewDay, 0, tz), zonedToUtc(addDays(previewDay, 1), 0, tz), ["pending", "booked", "confirmed", "checked_in", "in_service", "completed"]);
      const states = await loadClientStates(db, salon.id, [...new Set(day.rows.map((r) => r.client_id))]);
      const low = (await loadProducts(db, salon.id)).filter((p) => ["low", "out"].includes(stockLevel(p)));
      const lowLine = low.length ? `Low on ${low.length} product${low.length === 1 ? "" : "s"}: ${low.slice(0, 4).map((p) => p.name).join(", ")}${low.length > 4 ? ", …" : ""}.` : "";
      for (const r of todo) {
        const mine = day.rows.filter((x) => !r.staffId || x.staff_id === r.staffId);
        const items = mine.map((x) => {
          const st = states[x.client_id];
          const standing = st ? clientStanding(reviveClientState(st), b.policy, now).standing : "clear";
          return { start: new Date(x.start_at), clientName: clientName(x), services: toInfo(x, day.paid).services, depositDue: x.status === "pending" || x.status === "booked" ? toInfo(x, day.paid).depositDue : 0, flagged: standing === "active" || standing === "permanent" };
        });
        const preview = dayPreviewText(salon, previewDay, items);
        // Keep the link as the last line (push opens it).
        const lines = preview.split("\n");
        const body = lowLine ? [...lines.slice(0, -1), lowLine, lines[lines.length - 1]].join("\n") : preview;
        out.push(stylistRow({ salon, staff: r.contact, template: "stylistDayPreview", body, apptId: null, key: `day-preview:${r.staffId ?? "salon"}:${previewDay}`, sendAfter: now }));
      }
    }
  }

  if (s.client.rebookNudge.enabled && afterQuiet(now, tz, s.quietHours).getTime() === now.getTime()) {
    out.push(...(await rebookNudges(db, b, now)));
  }

  // Waitlist: close finished entries any time; offer openings outside quiet hours.
  const quiet = afterQuiet(now, tz, s.quietHours).getTime() !== now.getTime();
  out.push(...(await waitlistOffers(db, salon, quiet ? { ...s, client: { ...s.client, waitlist: { ...s.client.waitlist, enabled: false } } } : s, now)));

  await queueRows(db, out);
  return { queued: out.filter((r) => r.status === "queued").length, released };
}

/**
 * "Time to rebook": clients whose last visit was N weeks ago (within a two-week
 * window, so old clients aren't all messaged at once) and who have nothing booked since.
 */
async function rebookNudges(db: SupabaseClient, b: Business, now: Date): Promise<MessageRow[]> {
  const { salon, settings: s } = b;
  const weeks = s.client.rebookNudge.afterWeeks;
  const to = new Date(now.getTime() - weeks * 7 * 86_400_000);
  const from = new Date(to.getTime() - 14 * 86_400_000);
  const { rows: visits } = await loadAppts(db, salon.id, from, to, ["completed"]);
  if (!visits.length) return [];
  const latest = new Map<string, ApptRow>();
  for (const v of visits) latest.set(v.client_id, v); // ordered by start, so the last one wins
  const clientIds = [...latest.keys()];
  const { data: later, error } = await db
    .from("appointments")
    .select("client_id")
    .eq("business_id", salon.id)
    .in("client_id", clientIds)
    .gt("start_at", to.toISOString())
    .not("status", "in", "(cancelled,no_show)");
  if (error) throw new Error(error.message);
  const busy = new Set((later ?? []).map((r) => r.client_id as string));
  const due = [...latest.values()].filter((v) => !busy.has(v.client_id));
  const used = await usedKeys(db, salon.id, due.map((v) => `rebook:${v.id}`));
  return due
    .filter((v) => !used.has(`rebook:${v.id}`))
    .flatMap((v) => clientRows({ salon, settings: s, to: toRecipient(v), appt: null, template: "rebookNudge", channels: s.client.rebookNudge.channels ?? ["sms"], key: `rebook:${v.id}`, sendAfter: now, extra: { weeks } }));
}

function dayPreviewDateTime(d: Date, tz: string) {
  return d.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

interface QueuedRow {
  id: string;
  business_id: string;
  channel: "sms" | "email" | "push";
  audience: string;
  template: string;
  body: string;
  to_address: string | null;
  send_after: string;
  attempts: number;
}

/** A chairvana link at the end of a message (e.g. the day preview), as a path. */
function linkIn(body: string): string | undefined {
  const last = body.trim().split("\n").pop() ?? "";
  try {
    const u = new URL(last);
    return u.pathname + u.search;
  } catch {
    return undefined;
  }
}

const PUSH_TITLE: Record<string, string> = {
  stylistNewBooking: "New online booking",
  stylistHoldReleased: "Hold released",
  stylistBeforeEach: "Next client",
  stylistDayPreview: "Day preview",
  stylistCheckIn: "Client checked in",
  stylistClientChange: "Appointment changed by client",
  stylistTest: "Chairvana alerts are on",
  stylistWaitlist: "New on the waitlist",
  stylistReview: "New review",
};

const SUBJECT: Record<string, string> = {
  reminder: "Appointment reminder",
  confirmation: "You're booked",
  change: "Your appointment changed",
  cancel: "Appointment cancelled",
  depositRequest: "Deposit needed to hold your time",
  depositReminder: "Reminder: deposit needed",
  holdReleased: "Your hold was released",
  receipt: "Your receipt",
  reviewRequest: "Thanks for coming in",
  rebookNudge: "Time for your next visit?",
  waitlistOffer: "A time opened up",
  formRequest: "Please fill out before your visit",
  sickReschedule: "Your stylist is out: pick a new time",
};

/** Sends queued messages that are due. Each one is claimed first, so two runs can't send the same message. */
export async function deliverQueued(db: SupabaseClient, sender: Sender, now: Date, salons: Map<string, string>, onlyIds?: string[]): Promise<{ sent: number; skipped: number; failed: number }> {
  let q = db.from("messages").select("id,business_id,channel,audience,template,body,to_address,send_after,attempts").eq("status", "queued").lte("send_after", now.toISOString()).order("send_after").limit(100);
  if (onlyIds) q = q.in("id", onlyIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const tally = { sent: 0, skipped: 0, failed: 0 };

  for (const m of (data ?? []) as QueuedRow[]) {
    const { data: claimed } = await db.from("messages").update({ status: "sending", attempts: m.attempts + 1 }).eq("id", m.id).eq("status", "queued").select("id");
    if (!claimed?.length) continue;
    const finish = (patch: Record<string, unknown>) => db.from("messages").update(patch).eq("id", m.id);

    if (now.getTime() - new Date(m.send_after).getTime() > STALE_HOURS * 3_600_000) {
      await finish({ status: "skipped", error: "Too late to send" });
      tally.skipped++;
      continue;
    }
    if (m.channel === "push") {
      const r = m.to_address ? await pushToStaff(db, m.to_address, { title: PUSH_TITLE[m.template] ?? "Chairvana", body: linkIn(m.body) ? m.body.trim().split("\n").slice(0, -1).join("\n") : m.body, url: linkIn(m.body) ?? "/app/today", tag: m.template }) : { ok: false, error: "No device" };
      if (r.ok) {
        await finish({ status: "sent", sent_at: new Date().toISOString(), error: null });
        tally.sent++;
      } else {
        await finish({ status: "failed", error: r.error ?? "Push failed" });
        tally.failed++;
      }
      continue;
    }
    const fn = m.channel === "sms" ? sender.sms : sender.email;
    if (!fn || !m.to_address) {
      await finish({ status: "skipped", error: !fn ? (m.channel === "sms" ? "Texting isn't connected yet" : "Email isn't connected yet") : "No address" });
      tally.skipped++;
      continue;
    }
    const salon = salons.get(m.business_id) ?? "Your salon";
    const r = m.channel === "sms" ? await sender.sms!(m.to_address, m.body) : await sender.email!(m.to_address, m.audience === "stylist" ? `Chairvana: ${salon}` : `${SUBJECT[m.template] ?? "Message"}`, m.body, { fromName: m.audience === "stylist" ? "Chairvana" : salon });
    if (r.ok) {
      await finish({ status: "sent", sent_at: new Date().toISOString(), provider_id: r.id ?? null, error: null });
      tally.sent++;
    } else if (r.retry && m.attempts + 1 < 3) {
      await finish({ status: "queued", send_after: new Date(now.getTime() + 5 * 60_000).toISOString(), error: r.error });
    } else {
      await finish({ status: "failed", error: r.error });
      tally.failed++;
      // The number replied STOP at some point: stop offering texts to it here too.
      if (m.channel === "sms" && r.error && OPTED_OUT_ERROR.test(r.error)) await setTextingFor(db, m.to_address, false).catch(() => null);
    }
  }
  return tally;
}

/** One pass for every salon: schedule what's due, then send. Called every 5 minutes. */
export async function runMessages(db: SupabaseClient, sender: Sender, now: Date, siteUrl: string): Promise<RunSummary> {
  const businesses = await loadBusinesses(db, siteUrl);
  const sum: RunSummary = { queued: 0, released: 0, sent: 0, skipped: 0, failed: 0 };
  for (const b of businesses) {
    try {
      const r = await scheduleBusiness(db, b, now);
      sum.queued += r.queued;
      sum.released += r.released;
    } catch (e) {
      console.error(`[messages] scheduling failed for ${b.salon.id}: ${(e as Error).message}`);
    }
  }
  const d = await deliverQueued(db, sender, now, new Map(businesses.map((b) => [b.salon.id, b.salon.name])));
  return { ...sum, ...d };
}
