"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BUSINESS_COOKIE, membershipsOf } from "@/lib/setup/bootstrap";
import { createClient } from "@/lib/supabase/server";

/** Work in another salon (or your own business). Only ones this login belongs to. */
export async function switchBusiness(businessId: string): Promise<{ ok: false; error: string }> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/app/login");
  const mine = await membershipsOf(user.id);
  if (!mine.some((m) => m.businessId === businessId)) return { ok: false, error: "You're not on that team any more. Refresh the page." };
  (await cookies()).set(BUSINESS_COOKIE, businessId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 400 });
  redirect("/app/today");
}
