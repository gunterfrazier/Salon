import "server-only";
import { redirect } from "next/navigation";
import type { PolicySettings } from "./policy/types";
import type { BundleRule } from "./pricing/discounts";
import { ensureBusinessFor } from "./setup/bootstrap";
import { createClient } from "./supabase/server";

export type Hours = Partial<Record<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat", [string, string] | null>>;

export interface Business {
  id: string;
  name: string;
  timezone: string;
  business_hours: Hours;
  policy_settings: PolicySettings;
  pricing_rules: { bundles?: BundleRule[] };
}

/**
 * Signed-in user, their staff record and business. Redirects to /login when
 * signed out; first-run setup happens here for owners.
 */
export async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businessId = await ensureBusinessFor(user);
  if (!businessId) redirect("/dashboard"); // shows "not set up" message

  const [{ data: business, error }, { data: staff }] = await Promise.all([
    supabase.from("businesses").select("id,name,timezone,business_hours,policy_settings,pricing_rules").eq("id", businessId).single(),
    supabase.from("staff").select("id,display_name,role").eq("business_id", businessId).eq("auth_user_id", user.id).single(),
  ]);
  if (error || !business || !staff) throw new Error(`Couldn't load salon: ${error?.message ?? "missing staff record"}`);

  return { supabase, user, business: business as Business, staff: staff as { id: string; display_name: string; role: string } };
}
