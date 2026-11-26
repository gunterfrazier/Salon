"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { visibleClientIds } from "@/lib/data/client-scope";
import { createClientForm, TEMPLATE_COLS, type TemplateRow } from "@/lib/forms/server";
import { notifyClient } from "@/lib/notify/events";

/** Start a form for a client: text/email them the link, or fill it in here (returns the link). */
export async function startForm(clientId: string, templateId: string, how: "send" | "here"): Promise<{ ok: true; token: string; note?: string } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "clients.edit");
  if (no) return no;
  const scope = await visibleClientIds(ctx);
  if (scope && !scope.has(clientId)) return { ok: false, error: "You can't open this client." };
  const { data: t } = await ctx.supabase.from("form_templates").select(TEMPLATE_COLS).eq("id", templateId).eq("business_id", ctx.business.id).maybeSingle();
  if (!t) return { ok: false, error: "Pick a form." };
  // Reuse a copy that's already waiting.
  const { data: waiting } = await ctx.supabase.from("client_forms").select("id,token,title").eq("client_id", clientId).eq("template_id", templateId).eq("status", "pending").limit(1);
  const f = waiting?.[0] ?? (await createClientForm(ctx.supabase, ctx.business.id, t as TemplateRow, clientId, null));
  revalidatePath(`/app/clients/${clientId}`);
  if (how === "here") return { ok: true, token: f.token as string };
  const site = process.env.SITE_URL ?? "https://chairvana.app";
  const r = await notifyClient(ctx.business.id, clientId, "formRequest", `form-sent:${f.id}:${Date.now()}`, { forms: f.title as string, form_link: `${site}/f/${f.token}`, date: "next" });
  return { ok: true, token: f.token as string, note: r.sent ? "Link sent." : `Not sent: ${r.why}. Copy the link instead.` };
}

/** Cancel a form that's waiting to be filled in. */
export async function voidForm(clientId: string, formId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "clients.edit");
  if (no) return no;
  const { error } = await ctx.supabase.from("client_forms").update({ status: "void" }).eq("id", formId).eq("client_id", clientId).eq("business_id", ctx.business.id).eq("status", "pending");
  if (error) return { ok: false, error: "Couldn't cancel it." };
  revalidatePath(`/app/clients/${clientId}`);
  return { ok: true };
}
