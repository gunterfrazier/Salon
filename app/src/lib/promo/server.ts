import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCode, promoDiscounts, promoProblem, type Promo } from "./promo";

type Row = { id: string; code: string; description: string | null; kind: "percent" | "amount"; value: number; service_ids: string[] | null; new_clients_only: boolean; min_spend_cents: number; starts_on: string | null; ends_on: string | null; max_uses: number | null; per_client: number; active: boolean };

export const PROMO_COLS = "id,code,description,kind,value,service_ids,new_clients_only,min_spend_cents,starts_on,ends_on,max_uses,per_client,active";

export const toPromo = (r: Row): Promo => ({
  id: r.id,
  code: r.code,
  description: r.description,
  kind: r.kind,
  value: r.value,
  serviceIds: r.service_ids,
  newClientsOnly: r.new_clients_only,
  minSpendCents: r.min_spend_cents,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  maxUses: r.max_uses,
  perClient: r.per_client,
  active: r.active,
});

/** Has this client finished a visit at the salon (here or before Chairvana)? */
async function isNewClient(db: SupabaseClient, businessId: string, clientId: string | null): Promise<boolean> {
  if (!clientId) return true;
  const [{ count }, { data: c }] = await Promise.all([
    db.from("appointments").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("client_id", clientId).eq("status", "completed"),
    db.from("clients").select("prior_visit_count").eq("id", clientId).maybeSingle(),
  ]);
  return (count ?? 0) === 0 && !(c?.prior_visit_count ?? 0);
}

/**
 * Check a code for these services and work out the discount. clientId may be
 * null (not known yet), in which case per-client limits are checked later.
 */
export async function checkPromo(
  db: SupabaseClient,
  businessId: string,
  code: string,
  o: { clientId: string | null; date: string; lines: { serviceId: string; cents: number }[]; ignoreAppointment?: string },
): Promise<{ ok: true; promo: Promo; perLine: number[]; total: number } | { ok: false; error: string }> {
  const c = normalizeCode(code);
  if (!c) return { ok: false, error: "Enter a code." };
  const { data } = await db.from("promo_codes").select(PROMO_COLS).eq("business_id", businessId).eq("code", c).maybeSingle();
  if (!data) return { ok: false, error: "That code isn't valid here." };
  const promo = toPromo(data as Row);
  let uses = db.from("promo_redemptions").select("client_id,appointment_id,appointments(status)").eq("promo_id", promo.id);
  if (o.ignoreAppointment) uses = uses.neq("appointment_id", o.ignoreAppointment);
  const { data: rows } = await uses;
  // Cancelled visits give the use back.
  const used = (rows ?? []).filter((u) => (u.appointments as unknown as { status: string } | null)?.status !== "cancelled");
  const problem = promoProblem(promo, {
    date: o.date,
    newClient: await isNewClient(db, businessId, o.clientId),
    clientUses: o.clientId ? used.filter((u) => u.client_id === o.clientId).length : 0,
    totalUses: used.length,
  });
  if (problem) return { ok: false, error: problem };
  const d = promoDiscounts(promo, o.lines);
  if (d.problem) return { ok: false, error: d.problem };
  return { ok: true, promo, perLine: d.perLine, total: d.total };
}
