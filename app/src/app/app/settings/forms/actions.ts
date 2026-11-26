"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { cleanFields, STARTER_FORMS, type Ask } from "@/lib/forms/model";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const ASKS = new Set<Ask>(["new_client", "chemical", "manual"]);

function done() {
  revalidatePath("/app/settings/forms");
}

/** Add one of the starter forms (turned on). */
export async function addStarter(key: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.messages");
  if (no) return no;
  const s = STARTER_FORMS.find((f) => f.key === key);
  if (!s) return { ok: false, error: "Unknown form." };
  const { data: last } = await ctx.supabase.from("form_templates").select("sort").eq("business_id", ctx.business.id).order("sort", { ascending: false }).limit(1);
  const { data, error } = await ctx.supabase
    .from("form_templates")
    .insert({ business_id: ctx.business.id, key: s.key, name: s.name, intro: s.intro, fields: s.fields, needs_signature: s.needsSignature, ask: s.ask, renew_months: s.renewMonths, active: true, sort: (last?.[0]?.sort ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "That form is already added." : "Couldn't add the form." };
  done();
  return { ok: true, id: data.id };
}

export interface TemplateSave {
  id: string | null;
  name: string;
  intro: string;
  fields: unknown;
  needsSignature: boolean;
  ask: Ask;
  renewMonths: number | null;
  active: boolean;
}

export async function saveTemplate(t: TemplateSave): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.messages");
  if (no) return no;
  const name = typeof t.name === "string" ? t.name.trim().slice(0, 100) : "";
  if (!name) return { ok: false, error: "Give the form a name." };
  const f = cleanFields(t.fields);
  if (!f.ok) return f;
  if (!ASKS.has(t.ask)) return { ok: false, error: "Pick when to ask for it." };
  const renew = t.renewMonths === null || t.renewMonths === undefined ? null : Math.round(Number(t.renewMonths));
  if (renew !== null && !(renew >= 1 && renew <= 60)) return { ok: false, error: "Ask again after 1 to 60 months, or never." };
  const row = { name, intro: typeof t.intro === "string" && t.intro.trim() ? t.intro.trim().slice(0, 1000) : null, fields: f.fields, needs_signature: !!t.needsSignature, ask: t.ask, renew_months: renew, active: !!t.active, updated_at: new Date().toISOString() };
  if (t.id) {
    const { error } = await ctx.supabase.from("form_templates").update(row).eq("id", t.id).eq("business_id", ctx.business.id);
    if (error) return { ok: false, error: "Couldn't save the form." };
    done();
    return { ok: true, id: t.id };
  }
  const { data: last } = await ctx.supabase.from("form_templates").select("sort").eq("business_id", ctx.business.id).order("sort", { ascending: false }).limit(1);
  const { data, error } = await ctx.supabase.from("form_templates").insert({ ...row, business_id: ctx.business.id, sort: (last?.[0]?.sort ?? 0) + 1 }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save the form." };
  done();
  return { ok: true, id: data.id };
}

/** Delete a form. Copies clients already filled in are kept. */
export async function deleteTemplate(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.messages");
  if (no) return no;
  await ctx.supabase.from("client_forms").update({ status: "void" }).eq("template_id", id).eq("business_id", ctx.business.id).eq("status", "pending");
  const { error } = await ctx.supabase.from("form_templates").delete().eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't delete the form." };
  done();
  return { ok: true };
}
