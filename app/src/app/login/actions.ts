"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isOwnerEmail, ownerEmails } from "@/lib/auth/owners";
import { mayHaveAccount } from "@/lib/auth/whoami";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** Email + password. Stays signed in on this device until you sign out. */
export async function signInWithPassword(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL.test(email)) return { status: "error", message: "Enter a valid email address." };
  if (!password) return { status: "error", message: "Enter your password, or use the email link below." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/rate|too many/i.test(error.message)) return { status: "error", message: "Too many tries. Wait a minute and try again." };
    return { status: "error", message: "Email or password didn't match. No password yet? Use “Email me a sign-in link” below, then set one in Account." };
  }
  redirect("/");
}

/**
 * Email a one-time sign-in link (also used to reset a password). Sent to
 * owners, team members and clients; the reply is the same for everyone so the
 * page never reveals who has an account.
 */
export async function sendSignInLink(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = form.get("purpose") === "reset" ? "/account?reset=1" : "/";
  if (!EMAIL.test(email)) return { status: "error", message: "Enter your email address first." };
  const sent: LoginState = { status: "sent", message: email };
  if (ownerEmails().length === 0) {
    console.error("[login] OWNER_EMAILS is not set; no one can sign in");
    return { status: "error", message: "Sign-in isn't set up yet: no owner email has been added to the app's settings." };
  }
  if (!(await mayHaveAccount(email, isOwnerEmail(email)))) return sent;

  // Make sure there's a login for this email (public sign-ups stay off in Supabase).
  const admin = createAdminClient();
  const { error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (createErr && !/already|exists|registered/i.test(createErr.message)) {
    console.error("[login] createUser failed:", createErr.message);
    return { status: "error", message: "Couldn't send the link. Try again in a minute." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    console.error("[login] signInWithOtp failed:", error.message);
    return { status: "error", message: /rate|seconds/i.test(error.message) ? "Too many emails just now. Wait a minute and try again." : "Couldn't send the link. Try again in a minute." };
  }
  return sent;
}
