import "server-only";
import { createAdminClient } from "../supabase/admin";
import { STAFF_COLS, toStylists, type StaffRow } from "../staff/stylists";

export interface CustomerHome {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  smsOptIn: boolean;
  homeZip: string | null;
  hasHome: boolean;
  searchMiles: number;
  preferredSalon: { id: string; slug: string; name: string; stylists: { id: string; name: string; title: string | null }[] } | null;
  preferredStylistId: string | null;
  /** Salons they've been to or chose (for the "my salon" picker). */
  salons: { id: string; slug: string; name: string }[];
}

export async function loadCustomerHome(customerId: string, linkedBusinessIds: string[]): Promise<CustomerHome | null> {
  const db = createAdminClient();
  const { data: c } = await db.from("customers").select("*").eq("id", customerId).single();
  if (!c) return null;
  const ids = [...new Set([...linkedBusinessIds, ...(c.preferred_business_id ? [c.preferred_business_id] : [])])];
  const { data: biz } = ids.length ? await db.from("businesses").select("id,slug,name").in("id", ids).eq("status", "approved") : { data: [] };
  let preferredSalon: CustomerHome["preferredSalon"] = null;
  const pb = (biz ?? []).find((b) => b.id === c.preferred_business_id);
  if (pb) {
    const { data: staff } = await db.from("staff").select(STAFF_COLS).eq("business_id", pb.id);
    preferredSalon = { ...pb, stylists: toStylists((staff ?? []) as StaffRow[]).map((s) => ({ id: s.id, name: s.name, title: s.title })) };
  }
  return {
    id: c.id,
    email: c.email,
    firstName: c.first_name,
    lastName: c.last_name,
    phone: c.phone,
    smsOptIn: c.sms_opt_in,
    homeZip: c.home_zip,
    hasHome: c.home_lat != null,
    searchMiles: c.search_miles,
    preferredSalon,
    preferredStylistId: preferredSalon?.stylists.some((s) => s.id === c.preferred_staff_id) ? c.preferred_staff_id : null,
    salons: (biz ?? []).map((b) => ({ id: b.id, slug: b.slug, name: b.name })),
  };
}
