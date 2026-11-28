import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneKey } from "../clients/import";

/**
 * Copy a leaving team member's clients (everyone they saw or were booked with
 * at the salon) into their own business, with the color formulas from their
 * appointments. The salon keeps its records. Clients already in their book
 * (same phone or email) get the formulas added instead of a duplicate. Text
 * consent isn't copied: it was given to the salon.
 */
export async function copyClientsToOwnBusiness(db: SupabaseClient, fromBusinessId: string, staffId: string, toBusinessId: string): Promise<{ added: number; matched: number; formulas: number }> {
  const { data: appts } = await db.from("appointments").select("id,client_id").eq("business_id", fromBusinessId).eq("staff_id", staffId).limit(20000);
  const clientIds = [...new Set((appts ?? []).map((a) => a.client_id as string))];
  const apptIds = new Set((appts ?? []).map((a) => a.id as string));
  if (!clientIds.length) return { added: 0, matched: 0, formulas: 0 };

  const [{ data: clients }, { data: mine }] = await Promise.all([
    db.from("clients").select("id,first_name,last_name,phone,email,notes").eq("business_id", fromBusinessId).in("id", clientIds),
    db.from("clients").select("id,phone,email").eq("business_id", toBusinessId).limit(20000),
  ]);
  const byPhone = new Map((mine ?? []).filter((c) => phoneKey(c.phone as string)).map((c) => [phoneKey(c.phone as string), c.id as string]));
  const byEmail = new Map((mine ?? []).filter((c) => c.email).map((c) => [(c.email as string).toLowerCase(), c.id as string]));

  let added = 0;
  let matched = 0;
  const target = new Map<string, string>(); // salon client id → their client id
  for (const c of clients ?? []) {
    const hit = byPhone.get(phoneKey(c.phone as string)) ?? (c.email ? byEmail.get((c.email as string).toLowerCase()) : undefined);
    if (hit) {
      target.set(c.id as string, hit);
      matched++;
      continue;
    }
    const { data: row, error } = await db.from("clients").insert({ business_id: toBusinessId, first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email, notes: c.notes, source: "manual", sms_opt_in: false }).select("id").single();
    if (error) continue;
    target.set(c.id as string, row.id as string);
    added++;
  }

  // Formulas from their own appointments.
  const { data: formulas } = await db.from("color_formulas").select("client_id,appointment_id,formula_text,developer,processing_min,notes,created_at").eq("business_id", fromBusinessId).in("client_id", clientIds);
  const rows = (formulas ?? [])
    .filter((f) => f.appointment_id && apptIds.has(f.appointment_id as string) && target.has(f.client_id as string))
    .map((f) => ({ business_id: toBusinessId, client_id: target.get(f.client_id as string)!, formula_text: f.formula_text, developer: f.developer, processing_min: f.processing_min, notes: f.notes, created_at: f.created_at }));
  let copied = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("color_formulas").insert(rows.slice(i, i + 500));
    if (!error) copied += rows.slice(i, i + 500).length;
  }
  await db.from("staff").update({ clients_copied_at: new Date().toISOString(), clients_copied_to: toBusinessId }).eq("id", staffId);
  return { added, matched, formulas: copied };
}

/** The team member's own business (a stylist's solo business they own), if they have one. */
export async function ownBusinessOf(db: SupabaseClient, authUserId: string | null): Promise<{ id: string; name: string } | null> {
  if (!authUserId) return null;
  const { data } = await db.from("staff").select("business_id,businesses(name,kind)").eq("auth_user_id", authUserId).eq("role", "owner").eq("active", true);
  const solo = ((data ?? []) as unknown as { business_id: string; businesses: { name: string; kind: string } | null }[]).find((r) => r.businesses?.kind === "solo");
  return solo ? { id: solo.business_id, name: solo.businesses!.name } : null;
}
