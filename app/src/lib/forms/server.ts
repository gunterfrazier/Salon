import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formNeeded, type Ask, type FormField } from "./model";

export interface TemplateRow {
  id: string;
  key: string | null;
  name: string;
  intro: string | null;
  fields: FormField[];
  needs_signature: boolean;
  ask: Ask;
  renew_months: number | null;
  active: boolean;
  sort: number;
}

export const TEMPLATE_COLS = "id,key,name,intro,fields,needs_signature,ask,renew_months,active,sort";

/** A fresh copy of a form for a client to fill in. */
export async function createClientForm(db: SupabaseClient, businessId: string, t: TemplateRow, clientId: string, appointmentId: string | null): Promise<{ id: string; token: string; title: string }> {
  const { data, error } = await db
    .from("client_forms")
    .insert({ business_id: businessId, client_id: clientId, template_id: t.id, appointment_id: appointmentId, title: t.name, intro: t.intro, fields: t.fields, needs_signature: t.needs_signature })
    .select("id,token,title")
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string; token: string; title: string };
}

/**
 * Forms this booking calls for (new client, color/chemical services, renewal
 * due) that the client hasn't filled in or been sent already. Creates them and
 * returns them in template order, plus any older ones still waiting.
 */
export async function formsForBooking(db: SupabaseClient, businessId: string, appointmentId: string, clientId: string, now = new Date()): Promise<{ token: string; title: string }[]> {
  const { data: templates } = await db.from("form_templates").select(TEMPLATE_COLS).eq("business_id", businessId).eq("active", true).neq("ask", "manual").order("sort");
  if (!templates?.length) return [];
  const [{ data: lines }, { count: visits }, { data: mine }] = await Promise.all([
    db.from("appointment_services").select("services(stage)").eq("appointment_id", appointmentId),
    db.from("appointments").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("client_id", clientId).eq("status", "completed"),
    db.from("client_forms").select("template_id,status,completed_at,token,title").eq("business_id", businessId).eq("client_id", clientId).in("status", ["pending", "completed"]),
  ]);
  const stages = ((lines ?? []) as unknown as { services: { stage: string } | null }[]).map((l) => l.services?.stage ?? "");
  const { data: client } = await db.from("clients").select("prior_visit_count").eq("id", clientId).maybeSingle();
  const newClient = (visits ?? 0) === 0 && !((client as { prior_visit_count?: number } | null)?.prior_visit_count ?? 0);
  const out: { token: string; title: string }[] = [];
  for (const t of templates as TemplateRow[]) {
    const copies = (mine ?? []).filter((m) => m.template_id === t.id);
    const pending = copies.find((m) => m.status === "pending");
    const last = copies.filter((m) => m.completed_at).map((m) => new Date(m.completed_at as string)).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
    if (pending) {
      // Still waiting from an earlier booking, and still relevant: send it again.
      if (formNeeded({ ask: t.ask, renewMonths: t.renew_months, newClient, stages, lastCompleted: last, pending: false }, now)) out.push({ token: pending.token as string, title: pending.title as string });
      continue;
    }
    if (formNeeded({ ask: t.ask, renewMonths: t.renew_months, newClient, stages, lastCompleted: last, pending: false }, now)) {
      const f = await createClientForm(db, businessId, t, clientId, appointmentId);
      out.push({ token: f.token, title: f.title });
    }
  }
  return out;
}

/** Forms a client still needs to fill in at this salon, oldest first. */
export async function pendingForms(db: SupabaseClient, businessId: string, clientId: string): Promise<{ id: string; token: string; title: string }[]> {
  const { data } = await db.from("client_forms").select("id,token,title").eq("business_id", businessId).eq("client_id", clientId).eq("status", "pending").order("created_at");
  return (data ?? []) as { id: string; token: string; title: string }[];
}
