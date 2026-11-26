import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicBusiness, loadPublicServices } from "../data/public-booking";
import { salonOpenings } from "../discovery/openings";
import { clientRows, type MessageRow, type SalonInfo } from "../notify/outbox";
import type { NotificationSettings } from "../notify/settings";
import { todayIn, toHHMM, tzAbbrev, zonedToUtc } from "../time/zone";
import { entryCriteria, isFulfilled, listOpenings, offerFor, slotKey, type WaitEntry } from "./match";

interface Row {
  id: string;
  client_id: string;
  staff_id: string | null;
  service_ids: string[];
  weekdays: number[];
  time_from: number;
  time_to: number;
  date_from: string;
  date_to: string;
  offers: number;
  last_offered_at: string | null;
  last_offered_slots: string[];
  created_at: string;
  clients: { first_name: string; phone: string | null; email: string | null; sms_opt_in: boolean } | null;
}

const toEntry = (r: Row): WaitEntry => ({
  id: r.id,
  clientId: r.client_id,
  staffId: r.staff_id,
  serviceIds: r.service_ids,
  weekdays: r.weekdays,
  timeFrom: r.time_from,
  timeTo: r.time_to,
  dateFrom: r.date_from,
  dateTo: r.date_to,
  lastOfferedAt: r.last_offered_at ? new Date(r.last_offered_at) : null,
  lastOfferedSlots: r.last_offered_slots ?? [],
  createdAt: new Date(r.created_at),
});

/**
 * One pass over a salon's waitlist: close entries that are past or already
 * booked, and offer new openings to the rest. Returns messages to queue.
 */
export async function waitlistOffers(db: SupabaseClient, salon: SalonInfo, settings: NotificationSettings, now: Date): Promise<MessageRow[]> {
  const tz = salon.timezone;
  const today = todayIn(tz);
  const nowIso = now.toISOString();

  // Past their last day: expired.
  await db.from("waitlist").update({ status: "expired", closed_at: nowIso }).eq("business_id", salon.id).eq("status", "active").lt("date_to", today);

  const { data, error } = await db
    .from("waitlist")
    .select("id,client_id,staff_id,service_ids,weekdays,time_from,time_to,date_from,date_to,offers,last_offered_at,last_offered_slots,created_at,clients(first_name,phone,email,sms_opt_in)")
    .eq("business_id", salon.id)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return [];

  // Booked since joining? Close those first.
  const { data: appts } = await db
    .from("appointments")
    .select("client_id,start_at,created_at,appointment_services(service_id)")
    .eq("business_id", salon.id)
    .in("client_id", [...new Set(rows.map((r) => r.client_id))])
    .in("status", ["pending", "booked", "confirmed", "checked_in", "in_service", "completed"])
    .gte("start_at", zonedToUtc(today, 0, tz).toISOString());
  const booked = ((appts ?? []) as unknown as { client_id: string; start_at: string; created_at: string; appointment_services: { service_id: string }[] }[]).map((a) => ({
    clientId: a.client_id,
    date: new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(a.start_at)),
    serviceIds: a.appointment_services.map((s) => s.service_id),
    createdAt: new Date(a.created_at),
  }));
  const open: Row[] = [];
  for (const r of rows) {
    if (isFulfilled(toEntry(r), booked)) await db.from("waitlist").update({ status: "booked", closed_at: nowIso }).eq("id", r.id);
    else open.push(r);
  }

  const toggle = settings.client.waitlist;
  if (!toggle?.enabled || !open.length || !salon.slug) return [];
  const b = await loadPublicBusiness({ id: salon.id });
  if (!b) return [];
  const menu = await loadPublicServices(b.id);
  const out: MessageRow[] = [];

  for (const r of open) {
    const e = toEntry(r);
    if (e.lastOfferedAt && now.getTime() - e.lastOfferedAt.getTime() < 20 * 3_600_000) continue;
    const services = e.serviceIds.map((id) => menu.find((s) => s.id === id)).filter((s) => !!s);
    if (services.length !== e.serviceIds.length || !r.clients) continue;
    const found = await salonOpenings(b, services, entryCriteria(e, today), e.staffId, { limit: 12, perDay: 2 });
    const offer = offerFor(e, found, now);
    if (!offer) continue;
    const first = offer[0];
    const link = `${salon.siteUrl}/s/${salon.slug}/book?services=${e.serviceIds.join(",")}${e.staffId ? `&staff=${e.staffId}` : ""}&date=${first.date}&time=${toHHMM(first.minutes)}`;
    const msgs = clientRows({
      salon,
      settings,
      to: { clientId: r.client_id, firstName: r.clients.first_name, phone: r.clients.phone, email: r.clients.email, smsOptIn: r.clients.sms_opt_in },
      appt: null,
      template: "waitlistOffer",
      channels: toggle.channels ?? ["sms"],
      key: `waitlist:${e.id}:${offer.map(slotKey).join("|")}`,
      sendAfter: now,
      extra: { services: services.map((s) => s.name).join(", "), openings: listOpenings(offer, tzAbbrev(zonedToUtc(first.date, first.minutes, tz), tz)), waitlist_link: link },
    });
    out.push(...msgs);
    // Remember the offer even if it couldn't be sent, so it isn't retried every 5 minutes.
    await db.from("waitlist").update({ offers: r.offers + 1, last_offered_at: nowIso, last_offered_slots: offer.map(slotKey) }).eq("id", e.id);
  }
  return out;
}
