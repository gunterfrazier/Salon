"use server";

import { headers } from "next/headers";
import { isOwnerEmail, ownerEmails } from "@/lib/auth/owners";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * Email a one-time sign-in link. Only addresses in OWNER_EMAILS get one; the
 * reply is the same either way so the page never reveals who is allowed.
 */
export async function sendSignInLink(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  const sent: LoginState = { status: "sent", message: email };
  // Setup not finished: say so instead of silently sending nothing. This
  // reveals only that no owner is configured, not who is allowed.
  if (ownerEmails().length === 0) {
    console.error("[login] OWNER_EMAILS is not set; no one can sign in");
    return { status: "error", message: "Sign-in isn't set up yet: no owner email has been added to the app's settings." };
  }
  if (!isOwnerEmail(email)) return sent;

  // Make sure the owner has a login (public sign-ups stay off in Supabase).
  const admin = createAdminClient();
  const { error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (createErr && !/already|exists|registered/i.test(createErr.message)) {
    console.error("[login] createUser failed:", createErr.message);
    return { status: "error", message: "Couldn't send the link. Try again in a minute." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error) {
    console.error("[login] signInWithOtp failed:", error.message);
    return { status: "error", message: /rate|seconds/i.test(error.message) ? "Too many tries. Wait a minute and try again." : "Couldn't send the link. Try again in a minute." };
  }
  return sent;
}
