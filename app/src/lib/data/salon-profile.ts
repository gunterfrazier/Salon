import "server-only";
import { branding, type Branding } from "../branding";
import { mediaUrl } from "../media";
import type { Hours } from "../context";
import { createAdminClient } from "../supabase/admin";
import { STAFF_COLS, toStylists, type StaffRow } from "../staff/stylists";
import { loadPublicServices, type PublicService } from "./public-booking";

export interface SalonProfile {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  hours: Hours;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  about: string | null;
  social: Record<string, string>;
  branding: Branding;
  logoUrl: string | null;
  coverUrl: string | null;
  photos: { id: string; url: string; caption: string | null; staffId: string | null }[];
  lat: number | null;
  lng: number | null;
  stylists: { id: string; name: string; title: string | null; bio: string | null; serviceIds: string[] | null }[];
  services: PublicService[];
}

/** An approved salon's public page. */
export async function loadSalonProfile(slug: string): Promise<SalonProfile | null> {
  const db = createAdminClient();
  const { data: b } = await db
    .from("businesses")
    .select("id,slug,name,timezone,business_hours,street,city,state,zip,phone,about,lat,lng,social,branding")
    .eq("slug", slug.toLowerCase())
    .eq("status", "approved")
    .maybeSingle();
  if (!b) return null;
  const [{ data: staff }, services, { data: photoRows }] = await Promise.all([db.from("staff").select(`${STAFF_COLS},bio`).eq("business_id", b.id), loadPublicServices(b.id), db.from("salon_photos").select("id,path,caption,staff_id").eq("business_id", b.id).order("sort").order("created_at", { ascending: false }).limit(48)]);
  const look = branding(b.branding);
  const rows = (staff ?? []) as unknown as (StaffRow & { bio: string | null })[];
  const stylists = toStylists(rows).map((s) => ({ id: s.id, name: s.name, title: s.title, bio: rows.find((r) => r.id === s.id)?.bio ?? null, serviceIds: s.serviceIds }));
  return {
    id: b.id, slug: b.slug, name: b.name, timezone: b.timezone, hours: b.business_hours as Hours,
    street: b.street, city: b.city, state: b.state, zip: b.zip, phone: b.phone, about: b.about, social: (b.social ?? {}) as Record<string, string>, branding: look, logoUrl: mediaUrl(look.logoPath), coverUrl: mediaUrl(look.coverPath), photos: (photoRows ?? []).map((p) => ({ id: p.id, url: mediaUrl(p.path)!, caption: p.caption, staffId: p.staff_id })), lat: b.lat, lng: b.lng,
    stylists, services,
  };
}
