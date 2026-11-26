import "server-only";
import { bookingSettings, type BookingSettings, type Hours } from "../booking/availability";
import type { ServiceRow } from "../booking/build";
import type { StoredMethods } from "../payments/settings";
import type { PolicySettings } from "../policy/types";
import type { BundleRule } from "../pricing/discounts";
import { createAdminClient } from "../supabase/admin";
import { parseRange } from "./calendar";
import { addDays, zonedToUtc } from "../time/zone";

/**
 * Data for the public booking page. Clients aren't signed in, so this uses
 * the server-only admin client and returns only what the page needs.
 */
export interface PublicBusiness {
  id: string;
  name: string;
  timezone: string;
  hours: Hours;
  policy: PolicySettings;
  rules: BundleRule[];
  settings: BookingSettings;
  paymentMethods: StoredMethods;
  staffId: string;
}

export type PublicService = ServiceRow & { category: string; categorySort: number; sort: number; description: string | null };

export async function loadPublicBusiness(): Promise<PublicBusiness | null> {
  const admin = createAdminClient();
  const { data: b } = await admin
    .from("businesses")
    .select("id,name,timezone,business_hours,policy_settings,pricing_rules,booking_settings,payment_methods")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!b) return null;
  const { data: staff } = await admin.from("staff").select("id").eq("business_id", b.id).eq("active", true).order("created_at").limit(1).maybeSingle();
  if (!staff) return null;
  return {
    id: b.id,
    name: b.name,
    timezone: b.timezone,
    hours: b.business_hours as Hours,
    policy: b.policy_settings as PolicySettings,
    rules: (b.pricing_rules as { bundles?: BundleRule[] })?.bundles ?? [],
    settings: bookingSettings(b.booking_settings),
    paymentMethods: b.payment_methods as StoredMethods,
    staffId: staff.id,
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

/** The stylist's busy time on a salon-local date: hands-on blocks and time off. */
export async function loadBusy(b: PublicBusiness, date: string): Promise<{ start: Date; end: Date }[]> {
  const admin = createAdminClient();
  const from = zonedToUtc(date, 0, b.timezone).toISOString();
  const to = zonedToUtc(addDays(date, 1), 0, b.timezone).toISOString();
  const [blocks, off] = await Promise.all([
    admin.from("staff_busy_blocks").select("during").eq("staff_id", b.staffId).overlaps("during", `[${from},${to})`),
    admin.from("time_off").select("start_at,end_at").eq("staff_id", b.staffId).lt("start_at", to).gt("end_at", from),
  ]);
  if (blocks.error) throw new Error(blocks.error.message);
  if (off.error) throw new Error(off.error.message);
  return [...(blocks.data ?? []).map((x) => {
      const r = parseRange(x.during as string);
      return { start: new Date(r.start), end: new Date(r.end) };
    }), ...(off.data ?? []).map((t) => ({ start: new Date(t.start_at), end: new Date(t.end_at) }))];
}
