import "server-only";
import { findOpenings, searchWindow, type Opening, type SearchCriteria } from "../booking/search";
import { toBookable } from "../booking/build";
import { loadClosedChecker, loadPublicBusiness, loadPublicServices, type PublicBusiness, type PublicService } from "../data/public-booking";
import { loadBusyRange } from "../data/schedule";
import { milesBetween, type Point } from "../geo";
import { suggestOrder } from "../schedule/plan";
import { asDoneBy, hoursFor, whoOffers } from "../staff/stylists";
import { createAdminClient } from "../supabase/admin";
import { addDays, todayIn, zonedToUtc } from "../time/zone";
import { matchAll } from "./match";

const STAGES = { consult: 0, chemical: 1, treatment: 2, cut: 3, style: 4, wax: 5, fee: 9 };

/**
 * Openings at one salon for these services, with one stylist or anyone who
 * offers them all. Same rules as online booking (hours, notice, closures).
 */
export async function salonOpenings(b: PublicBusiness, services: PublicService[], criteria: SearchCriteria, staffId?: string | null, opts: { limit?: number; perDay?: number } = {}): Promise<Opening[]> {
  const ids = services.map((s) => s.id);
  const able = whoOffers(b.stylists, ids);
  const who = staffId && staffId !== "any" ? able.filter((s) => s.id === staffId) : able;
  if (!who.length) return [];
  const tz = b.timezone;
  const today = todayIn(tz);
  const horizonDays = b.settings.maxDaysAhead;
  const { first, last } = searchWindow(criteria.start, today, horizonDays);
  const from = zonedToUtc(first, 0, tz);
  const to = zonedToUtc(addDays(last, 1), 0, tz);
  const isClosed = await loadClosedChecker(b);
  const ordered = suggestOrder(services.map(toBookable), STAGES);
  const seen = new Map<string, Opening>();
  const db = createAdminClient();
  for (const st of who) {
    const busy = await loadBusyRange(db, b.id, st.id, from, to);
    for (const o of findOpenings({ services: asDoneBy(ordered, st), criteria, today, tz, hours: hoursFor(st, b.hours), isClosed, busy, now: new Date(), settings: b.settings, horizonDays, limit: opts.limit ?? 24, perDay: opts.perDay ?? 4 })) {
      seen.set(`${o.date} ${o.minutes}`, o);
    }
  }
  return [...seen.values()].sort((x, y) => x.date.localeCompare(y.date) || x.minutes - y.minutes).slice(0, opts.limit ?? 24);
}

export interface NearbySalon {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  miles: number;
}

/** Approved, listed salons within `miles` of a point, nearest first. */
export async function salonsNear(center: Point, miles: number, limit = 30): Promise<NearbySalon[]> {
  // Rough box first (1° lat ≈ 69 mi), then exact distance.
  const dLat = miles / 69;
  const dLng = miles / (69 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  const { data } = await createAdminClient()
    .from("businesses")
    .select("id,slug,name,city,state,lat,lng")
    .eq("status", "approved")
    .eq("listed", true)
    .gte("lat", center.lat - dLat)
    .lte("lat", center.lat + dLat)
    .gte("lng", center.lng - dLng)
    .lte("lng", center.lng + dLng)
    .limit(500);
  return (data ?? [])
    .map((b) => ({ id: b.id, slug: b.slug, name: b.name, city: b.city, state: b.state, miles: milesBetween(center, { lat: b.lat, lng: b.lng }) }))
    .filter((b) => b.miles <= miles)
    .sort((a, b) => a.miles - b.miles)
    .slice(0, limit);
}

export interface SalonResult {
  salon: { id: string; slug: string; name: string; timezone: string; miles: number | null; place: string };
  services: { id: string; name: string; priceCents: number; priceType: string }[];
  staffId: string | null;
  staffName: string | null;
  openings: Opening[];
}

/**
 * Openings for named services (e.g. "Women's Cut", or a past visit's services)
 * at each salon, matched to each salon's own menu. Salons that don't offer
 * them, or have no openings, are left out.
 */
export async function openingsAcross(salons: { slug: string; miles?: number | null }[], wanted: string[], criteria: SearchCriteria, staffBySalon: Record<string, string | null> = {}, perSalon = 4): Promise<SalonResult[]> {
  const out: SalonResult[] = [];
  for (const s of salons) {
    const b = await loadPublicBusiness({ slug: s.slug });
    if (!b) continue;
    const menu = await loadPublicServices(b.id);
    const services = matchAll(wanted, menu);
    if (!services) continue;
    const staffId = staffBySalon[b.id] ?? null;
    const openings = await salonOpenings(b, services, criteria, staffId, { limit: perSalon, perDay: 2 });
    if (!openings.length) continue;
    const { data: place } = await createAdminClient().from("businesses").select("city,state").eq("id", b.id).single();
    out.push({
      salon: { id: b.id, slug: b.slug, name: b.name, timezone: b.timezone, miles: s.miles ?? null, place: [place?.city, place?.state].filter(Boolean).join(", ") },
      services: services.map((x) => ({ id: x.id, name: x.name, priceCents: x.price_cents, priceType: x.price_type })),
      staffId,
      staffName: staffId ? (b.stylists.find((x) => x.id === staffId)?.name ?? null) : null,
      openings,
    });
  }
  return out;
}
