import "server-only";
import { isOwnerEmail } from "@/lib/auth/owners";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessRow, categoryRows, serviceRows } from "./seed";

const DEFAULT_NAME = process.env.BUSINESS_NAME ?? "Intensity Salon";

/**
 * Make sure a signed-in owner belongs to a business. The first owner to sign
 * in creates the business and loads the starter menu and settings; later
 * owners join that same business. Returns the business id, or null if the
 * user isn't an owner.
 */
export async function ensureBusinessFor(user: { id: string; email?: string | null }): Promise<string | null> {
  const admin = createAdminClient();

  const { data: existing, error: lookupErr } = await admin.from("staff").select("business_id").eq("auth_user_id", user.id).eq("active", true).limit(1);
  if (lookupErr) throw new Error(`staff lookup failed: ${lookupErr.message}`);
  if (existing?.length) return existing[0].business_id as string;
  if (!user.email || !isOwnerEmail(user.email)) return null;

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
