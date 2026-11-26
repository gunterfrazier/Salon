"use server";

import { headers } from "next/headers";
import { phoneKey } from "@/lib/clients/import";
import { locatePlace, parsePlace } from "@/lib/geo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SignupState = { status: "idle" | "sent" | "error"; message?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: FormDataEntryValue | null, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Customer sign-up, not tied to any salon. Saves the account, then emails a
 * sign-in link; the account (and any salon records with this email) is linked
 * when they open it.
 */
export async function signUp(_: SignupState, form: FormData): Promise<SignupState> {
  if (clean(form.get("company"))) return { status: "sent" }; // honeypot
  const first = clean(form.get("first"));
  const last = clean(form.get("last"));
  const email = clean(form.get("email"), 200).toLowerCase();
  const phone = clean(form.get("phone"), 40);
  const place = clean(form.get("zip"), 60);
  const texts = form.get("texts") === "on";
  if (!first) return { status: "error", message: "Enter your first name." };
  if (!EMAIL.test(email)) return { status: "error", message: "Enter a valid email." };
  if (phone && phoneKey(phone).length < 10) return { status: "error", message: "Enter a 10-digit mobile number, or leave it blank." };
  const q = place ? parsePlace(place) : null;
  if (place && !q) return { status: "error", message: "Enter a 5-digit ZIP or City, ST." };
  const at = q ? await locatePlace(q) : null;

  const db = createAdminClient();
  const { data: existing } = await db.from("customers").select("id").ilike("email", email).maybeSingle();
  if (!existing) {
    const { error } = await db.from("customers").insert({
      email, first_name: first, last_name: last || null, phone: phone || null, sms_opt_in: texts && !!phone,
      home_zip: place || null, home_lat: at?.lat ?? null, home_lng: at?.lng ?? null,
    });
    if (error && error.code !== "23505") return { status: "error", message: "Couldn't create your account. Try again." };
  }

  // A login for this email, then the sign-in link (same as the sign-in page).
  const { error: createErr } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (createErr && !/already|exists|registered/i.test(createErr.message)) return { status: "error", message: "Couldn't send the link. Try again in a minute." };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/account?welcome=1")}` } });
  if (error) return { status: "error", message: /rate|seconds/i.test(error.message) ? "Too many emails just now. Wait a minute and try again." : "Couldn't send the link. Try again in a minute." };
  return { status: "sent", message: email };
}
