"use server";

import { headers } from "next/headers";
import { checkAnswers, type FormField } from "@/lib/forms/model";
import { pendingForms } from "@/lib/forms/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = /^[ML0-9. ]+$/;

/** A client submits a form from its link. */
export async function submitForm(token: string, answers: unknown, signature: { name?: string; path?: string } | null): Promise<{ ok: true; next: string | null } | { ok: false; error: string; field?: string }> {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "This link isn't valid." };
  const db = createAdminClient();
  const { data: f } = await db.from("client_forms").select("id,business_id,client_id,fields,needs_signature,status").eq("token", token).maybeSingle();
  if (!f) return { ok: false, error: "This link isn't valid." };
  if (f.status !== "pending") return { ok: false, error: f.status === "completed" ? "This form was already filled in." : "This form is no longer needed." };
  const checked = checkAnswers(f.fields as FormField[], answers);
  if (!checked.ok) return checked;
  let sig: { name: string; path: string } | null = null;
  if (f.needs_signature) {
    const name = typeof signature?.name === "string" ? signature.name.trim().slice(0, 120) : "";
    const path = typeof signature?.path === "string" ? signature.path.trim() : "";
    if (name.length < 2) return { ok: false, error: "Type your full name to sign." };
    if (!path || path.length > 40000 || !PATH.test(path) || (path.match(/L/g)?.length ?? 0) < 3) return { ok: false, error: "Sign with your finger or mouse in the box." };
    sig = { name, path };
  }
  const h = await headers();
  const { data: done, error } = await db
    .from("client_forms")
    .update({ status: "completed", answers: checked.answers, signature: sig, completed_at: new Date().toISOString(), completed_ip: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, completed_agent: h.get("user-agent")?.slice(0, 300) ?? null })
    .eq("id", f.id)
    .eq("status", "pending")
    .select("id");
  if (error || !done?.length) return { ok: false, error: "Couldn't save the form. Please try again." };
  const next = (await pendingForms(db, f.business_id, f.client_id)).find((x) => x.id !== f.id);
  return { ok: true, next: next?.token ?? null };
}
