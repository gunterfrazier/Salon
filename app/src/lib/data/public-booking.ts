import "server-only";
import { bookingSettings, type BookingSettings, type Hours } from "../booking/availability";
import type { ServiceRow } from "../booking/build";
import type { StoredMethods } from "../payments/settings";
import type { PolicySettings } from "../policy/types";
import type { BundleRule } from "../pricing/discounts";
import { isClosedDay, mergeHolidays, type DayOff, type HolidayRule } from "../schedule/holidays";
import { loadBusyRange, loadDaysOff } from "./schedule";
import { STAFF_COLS, toStylists, type StaffRow, type Stylist } from "../staff/stylists";
import { createAdminClient } from "../supabase/admin";
import { addDays, zonedToUtc } from "../time/zone";

/**
 * Data for the public booking page. Clients aren't signed in, so this uses
 * the server-only admin client and returns only what the page needs.
 */
export interface PublicBusiness {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  hours: Hours;
  policy: PolicySettings;
  rules: BundleRule[];
  settings: BookingSettings;
  paymentMethods: StoredMethods;
  holidays: HolidayRule[];
  /** Stylists clients can book with, in display order. */
  stylists: Stylist[];
}

export type PublicService = ServiceRow & { category: string; categorySort: number; sort: number; description: string | null };

/**
 * A salon that takes online bookings, by its web address (slug) or id. Only
 * approved salons. With neither, the only approved salon (single-salon setups).
 */
export async function loadPublicBusiness(sel: { slug?: string | null; id?: string | null; anyStatus?: boolean } = {}): Promise<PublicBusiness | null> {
  const admin = createAdminClient();
  let q = admin
    .from("businesses")
    .select("id,slug,name,timezone,business_hours,policy_settings,pricing_rules,booking_settings,payment_methods,holidays");
  // Public pages only show approved salons; a client's own link (e.g. a sick-day reschedule) works for any.
  if (!sel.anyStatus) q = q.eq("status", "approved");
  if (sel.id) q = q.eq("id", sel.id);
  else if (sel.slug) q = q.eq("slug", sel.slug.toLowerCase());
  const { data: rows } = await q.order("created_at").limit(2);
  if (!rows?.length || (!sel.id && !sel.slug && rows.length > 1)) return null;
  const b = rows[0];
  const { data: staff } = await admin.from("staff").select(STAFF_COLS).eq("business_id", b.id).order("created_at");
  const stylists = toStylists((staff ?? []) as StaffRow[]);
  if (!stylists.length) return null;
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    timezone: b.timezone,
    hours: b.business_hours as Hours,
    policy: b.policy_settings as PolicySettings,
    rules: (b.pricing_rules as { bundles?: BundleRule[] })?.bundles ?? [],
    settings: bookingSettings(b.booking_settings),
    paymentMethods: b.payment_methods as StoredMethods,
    holidays: mergeHolidays(b.holidays as { rules?: HolidayRule[] }),
    stylists,
  };
}

export async function loadPublicServices(businessId: string): Promise<PublicService[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("services")
    .select("id,key,name,description,price_type,price_cents,estimated_hours,active_min,processing_min,finish_min,deposit_category,stage,includes,is_add_on,sort,service_categories(name,sort)")
    .eq("business_id", businessId)
    .eq("archived", false)
    .eq("bookable_online", true);
  if (error) throw new Error(error.message);
  type Row = PublicService & { service_categories: { name: string; sort: number } | null };
  return ((data ?? []) as unknown as Row[])
    .map(({ service_categories, ...s }) => ({ ...s, category: service_categories?.name ?? "Other", categorySort: service_categories?.sort ?? 99 }))
    .sort((a, b) => a.categorySort - b.categorySort || a.sort - b.sort);
}

/** A stylist's busy time on a salon-local date. */
export async function loadBusy(b: PublicBusiness, date: string, staffId: string): Promise<{ start: Date; end: Date }[]> {
  return loadBusyRange(createAdminClient(), b.id, staffId, zonedToUtc(date, 0, b.timezone), zonedToUtc(addDays(date, 1), 0, b.timezone));
}

/** Closed-day check for the bookable window: holidays plus full days off. */
export async function loadClosedChecker(b: PublicBusiness): Promise<(date: string) => boolean> {
  const from = new Date();
  const to = new Date(from.getTime() + (b.settings.maxDaysAhead + 2) * 86_400_000);
  const daysOff: DayOff[] = await loadDaysOff(createAdminClient(), b.id, from, to);
  return (date) => isClosedDay(date, b.timezone, b.holidays, daysOff);
}
