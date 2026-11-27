import "server-only";
import { cookies } from "next/headers";
import { isOwnerEmail } from "@/lib/auth/owners";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessRow, categoryRows, serviceRows } from "./seed";

/** Which business a login with several is working in (set by Switch). */
export const BUSINESS_COOKIE = "cv_business";

async function chosenBusiness(): Promise<string | null> {
  try {
    const v = (await cookies()).get(BUSINESS_COOKIE)?.value ?? null;
    return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
  } catch {
    return null; // not in a request (scripts, tests)
  }
}

/** Every business this login can work in: active, not suspended. */
export async function membershipsOf(userId: string): Promise<{ businessId: string; name: string; kind: "salon" | "solo"; role: string; status: string }[]> {
  const { data } = await createAdminClient()
    .from("staff")
    .select("business_id,role,created_at,businesses(name,kind,status)")
    .eq("auth_user_id", userId)
    .eq("active", true)
    .is("suspended_at", null)
    .order("created_at");
  type Row = { business_id: string; role: string; businesses: { name: string; kind: string; status: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({ businessId: r.business_id, name: r.businesses?.name ?? "Salon", kind: r.businesses?.kind === "solo" ? "solo" : "salon", role: r.role, status: r.businesses?.status ?? "approved" }));
}

const DEFAULT_NAME = process.env.BUSINESS_NAME ?? "Intensity Salon";

/**
 * Make sure a signed-in owner belongs to a business. The first owner to sign
 * in creates the business and loads the starter menu and settings; later
 * owners join that same business. Returns the business id, or null if the
 * user isn't an owner.
 */
export async function ensureBusinessFor(user: { id: string; email?: string | null }): Promise<string | null> {
  const admin = createAdminClient();

  // Invited team member (any salon) signing in for the first time: link their login by email.
  if (user.email) {
    const { data: invited } = await admin.from("staff").select("id").ilike("email", user.email).is("auth_user_id", null).eq("active", true);
    for (const row of invited ?? []) await admin.from("staff").update({ auth_user_id: user.id }).eq("id", row.id);
  }

  const { data: existing, error: lookupErr } = await admin.from("staff").select("business_id").eq("auth_user_id", user.id).eq("active", true).is("suspended_at", null).order("created_at");
  if (lookupErr) throw new Error(`staff lookup failed: ${lookupErr.message}`);
  if (existing?.length) {
    // Several salons (or a salon and their own business): the one they last picked.
    const ids = existing.map((r) => r.business_id as string);
    const picked = await chosenBusiness();
    return picked && ids.includes(picked) ? picked : ids[0];
  }
  if (!user.email || !isOwnerEmail(user.email)) return null;
  // Suspended or turned off on that team: no access (and no second staff record).
  const { data: anyRow } = await admin.from("staff").select("id").eq("auth_user_id", user.id).limit(1);
  if (anyRow?.length) return null;

  // Single-salon mode: join the existing business if there is one.
  const { data: biz } = await admin.from("businesses").select("id").order("created_at").limit(1);
  let businessId = biz?.[0]?.id as string | undefined;

  if (!businessId) {
    const { data: created, error } = await admin.from("businesses").insert(businessRow(DEFAULT_NAME)).select("id").single();
    if (error) throw new Error(`create business failed: ${error.message}`);
    businessId = created.id as string;

    const { data: cats, error: catErr } = await admin.from("service_categories").insert(categoryRows(businessId)).select("id,key");
    if (catErr) throw new Error(`create categories failed: ${catErr.message}`);
    const ids = Object.fromEntries((cats ?? []).map((c) => [c.key as string, c.id as string]));

    const { error: svcErr } = await admin.from("services").insert(serviceRows(businessId, ids));
    if (svcErr) throw new Error(`create services failed: ${svcErr.message}`);
  }

  const { error: staffErr } = await admin.from("staff").insert({
    business_id: businessId,
    auth_user_id: user.id,
    role: "owner",
    display_name: user.email.split("@")[0],
    email: user.email,
  });
  if (staffErr) throw new Error(`create owner failed: ${staffErr.message}`);
  return businessId;
}
