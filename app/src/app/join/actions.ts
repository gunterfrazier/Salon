"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { TIMEZONES } from "@/lib/platform/zones";

export type JoinState = { status: "idle" | "sent" | "error"; message?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: FormDataEntryValue | null, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A salon asks to join. Reviewed by the platform before it goes live. */
export async function applyToJoin(_: JoinState, form: FormData): Promise<JoinState> {
  if (clean(form.get("website_url"))) return { status: "sent" }; // honeypot
  const salon = clean(form.get("salon"), 80);
  const owner = clean(form.get("owner"), 80);
  const email = clean(form.get("email"), 200).toLowerCase();
  const phone = clean(form.get("phone"), 40);
  const street = clean(form.get("street"));
  const city = clean(form.get("city"), 60);
  const state = clean(form.get("state"), 2).toUpperCase();
  const zip = clean(form.get("zip"), 10);
  const timezone = clean(form.get("timezone"), 40);
  const stylists = Number(clean(form.get("stylists"), 4)) || null;
  if (!salon || !owner) return { status: "error", message: "Enter the salon's name and yours." };
  if (!EMAIL.test(email)) return { status: "error", message: "Enter a valid email. It's how you'll sign in." };
  if (!/^\d{5}(-\d{4})?$/.test(zip)) return { status: "error", message: "Enter the salon's ZIP code." };
  if (!TIMEZONES.some(([tz]) => tz === timezone)) return { status: "error", message: "Pick your time zone." };

  const db = createAdminClient();
  const { data: open } = await db.from("salon_applications").select("id").ilike("email", email).eq("status", "pending").limit(1);
  if (open?.length) return { status: "sent", message: "We already have your request and will be in touch soon." };
  const { error } = await db.from("salon_applications").insert({
    salon_name: salon,
    owner_name: owner,
    email,
    phone: phone || null,
    street: street || null,
    city: city || null,
    state: state || null,
    zip,
    timezone,
    stylists,
    website: clean(form.get("website"), 200) || null,
    message: clean(form.get("message"), 1000) || null,
  });
  if (error) return { status: "error", message: "Couldn't send that. Please try again." };
  return { status: "sent" };
}
