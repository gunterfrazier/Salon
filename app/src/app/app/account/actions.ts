"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type PwState = { status: "idle" | "saved" | "error"; message?: string };

export async function setPassword(_: PwState, form: FormData): Promise<PwState> {
  const pw = String(form.get("password") ?? "");
  const again = String(form.get("confirm") ?? "");
  if (pw.length < 8) return { status: "error", message: "Use at least 8 characters." };
  if (pw !== again) return { status: "error", message: "The two passwords don't match." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/app/login");
  const { error } = await supabase.auth.updateUser({ password: pw, data: { has_password: true } });
  if (error) {
    if (/same|different/i.test(error.message)) return { status: "error", message: "That's your current password. Pick a new one." };
    if (/weak|pwned|leak/i.test(error.message)) return { status: "error", message: "That password is too common. Try a longer one." };
    return { status: "error", message: error.message };
  }
  return { status: "saved" };
}

/** Sign out of every device (e.g. a lost phone). */
export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/app/login");
}
