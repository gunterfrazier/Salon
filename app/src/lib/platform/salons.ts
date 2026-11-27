import { slugAllowed } from "@/lib/short-links";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerEmails } from "../auth/owners";
import { locateAddress, slugify } from "../geo";
import { businessRow, categoryRows, GENERIC_MENU, serviceRows, STARTER_HOURS } from "../setup/seed";

/** Platform admins (who approve salons): the owner emails set in the app's settings. */
export const isPlatformAdmin = (email: string | null | undefined) => !!email && ownerEmails().includes(email.toLowerCase());

export { TIMEZONES } from "./zones";

export interface Application {
  id: string;
  salon_name: string;
  owner_name: string;
  email: string;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  timezone: string;
  stylists: number | null;
  website: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

/** A web address that isn't taken: "glow-studio", then "glow-studio-ranburne", then with a number. */
export async function freeSlug(db: SupabaseClient, name: string, city?: string | null): Promise<string> {
  const base = slugify(name);
  const tries = [base, city ? `${base}-${slugify(city)}` : null, ...Array.from({ length: 20 }, (_, i) => `${base}-${i + 2}`)].filter(Boolean) as string[];
  for (const t of tries) {
    if (!slugAllowed(t)) continue;
    const { data } = await db.from("businesses").select("id").eq("slug", t).limit(1);
    if (!data?.length) return t;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

/**
 * Approve an application: create the salon (approved, with a starter menu and
 * hours), locate its address, and add the applicant as its owner. They sign in
 * with the email on the application. Returns the new salon's id and slug.
 */
export async function createSalonFromApplication(db: SupabaseClient, app: Application): Promise<{ id: string; slug: string }> {
  const slug = await freeSlug(db, app.salon_name, app.city);
  const point = await locateAddress({ street: app.street ?? "", city: app.city ?? "", state: app.state ?? "", zip: app.zip ?? "" }).catch(() => null);
  const { data: biz, error } = await db
    .from("businesses")
    .insert({
      ...businessRow(app.salon_name, { timezone: app.timezone, hours: STARTER_HOURS }),
      slug,
      status: "approved",
      listed: true,
      street: app.street,
      city: app.city,
      state: app.state,
      zip: app.zip,
      phone: app.phone,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`create salon failed: ${error.message}`);
  const id = biz.id as string;

  const { data: cats, error: catErr } = await db.from("service_categories").insert(categoryRows(id, GENERIC_MENU)).select("id,key");
  if (catErr) throw new Error(`create categories failed: ${catErr.message}`);
  const ids = Object.fromEntries((cats ?? []).map((c) => [c.key as string, c.id as string]));
  const { error: svcErr } = await db.from("services").insert(serviceRows(id, ids, GENERIC_MENU).map((s) => ({ ...s, price_needs_review: true })));
  if (svcErr) throw new Error(`create services failed: ${svcErr.message}`);

  const { error: staffErr } = await db.from("staff").insert({
    business_id: id,
    role: "owner",
    display_name: app.owner_name,
    email: app.email.toLowerCase(),
    phone: app.phone,
    invited_at: new Date().toISOString(),
    bookable: true,
  });
  if (staffErr) throw new Error(`add owner failed: ${staffErr.message}`);
  return { id, slug };
}
