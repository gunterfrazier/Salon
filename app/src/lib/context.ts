import "server-only";
import { cache } from "react";
import { cleanOverrides, permissionsFor, type Permission, type Role } from "./auth/permissions";
import { redirect } from "next/navigation";
import type { PolicySettings } from "./policy/types";
import type { StoredMethods } from "./payments/settings";
import type { BundleRule } from "./pricing/discounts";
import type { HolidayRule } from "./schedule/holidays";
import { linkedCustomer } from "./auth/whoami";
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
  payment_methods: StoredMethods;
  booking_settings: Record<string, unknown>;
  holidays: { rules?: HolidayRule[] } | null;
  notification_settings: Record<string, unknown> | null;
  role_permissions: Record<string, unknown> | null;
}

/**
 * Signed-in user, their staff record and business. Redirects to /login when
 * signed out; first-run setup happens here for owners.
 */
export const getContext = cache(async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/app/login");

  const businessId = await ensureBusinessFor(user);
  if (!businessId) {
    // Not on the salon team: clients go to their own page.
    const customer = await linkedCustomer(user);
    redirect(customer ? "/app/me" : "/app/login?error=noaccess");
  }

  const [{ data: business, error }, { data: staff }] = await Promise.all([
    supabase.from("businesses").select("id,name,timezone,business_hours,policy_settings,pricing_rules,payment_methods,booking_settings,holidays,notification_settings,role_permissions").eq("id", businessId).single(),
    supabase.from("staff").select("id,display_name,role").eq("business_id", businessId).eq("auth_user_id", user.id).single(),
  ]);
  if (error || !business || !staff) throw new Error(`Couldn't load salon: ${error?.message ?? "missing staff record"}`);

  const b = business as Business;
  const perms = permissionsFor(staff.role, cleanOverrides(b.role_permissions));
  return {
    supabase,
    user,
    business: b,
    staff: staff as { id: string; display_name: string; role: Role },
    perms,
    can: (p: Permission) => perms.has(p),
  };
});

export type Ctx = Awaited<ReturnType<typeof getContext>>;

/** For pages: the context, or back to Today when this person isn't allowed in. */
export async function requirePermission(p: Permission | Permission[]): Promise<Ctx> {
  const ctx = await getContext();
  const list = Array.isArray(p) ? p : [p];
  if (!list.some((x) => ctx.can(x))) redirect("/app/today?denied=1");
  return ctx;
}

/** For server actions: an error result when not allowed, else null. */
export function denied(ctx: Ctx, p: Permission): { ok: false; error: string } | null {
  return ctx.can(p) ? null : { ok: false, error: "Your role doesn't allow this. Ask the salon owner." };
}
