import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientStateJSON } from "./clients-shared";

export { reviveClientState, type ClientStateJSON } from "./clients-shared";

type ClientRow = { id: string; prior_visit_count: number; deposit_override: "none" | "amount" | "full"; deposit_override_cents: number | null };

export async function loadClientStates(supabase: SupabaseClient, businessId: string, clientIds: string[]): Promise<Record<string, ClientStateJSON>> {
  const ids = [...new Set(clientIds)];
  if (ids.length === 0) return {};

  const [clients, visits, flags, balances] = await Promise.all([
    supabase.from("clients").select("id,prior_visit_count,deposit_override,deposit_override_cents").eq("business_id", businessId).in("id", ids),
    supabase.from("appointments").select("client_id,start_at").eq("business_id", businessId).eq("status", "completed").in("client_id", ids),
    supabase
      .from("client_flags")
      .select("id,client_id,type,created_at,permanent,cleared_at,clear_note,fee_charged_cents,appointments(start_at)")
      .eq("business_id", businessId)
      .in("client_id", ids),
    supabase.from("balances").select("client_id,amount_cents").eq("business_id", businessId).is("settled_payment_id", null).in("client_id", ids),
  ]);
  for (const r of [clients, visits, flags, balances]) if (r.error) throw new Error(r.error.message);

  const out: Record<string, ClientStateJSON> = {};
  for (const c of (clients.data ?? []) as ClientRow[]) {
    out[c.id] = {
      onTimeVisits: [],
      priorVisitCount: c.prior_visit_count,
      flags: [],
      depositOverride:
        c.deposit_override === "full" ? { kind: "full" } : c.deposit_override === "amount" && c.deposit_override_cents ? { kind: "amount", amount: c.deposit_override_cents } : null,
      outstandingBalance: 0,
    };
  }
  for (const v of visits.data ?? []) out[v.client_id]?.onTimeVisits.push(v.start_at);
  for (const f of (flags.data ?? []) as unknown as {
    id: string; client_id: string; type: "late_cancel" | "no_show"; created_at: string; permanent: boolean;
    cleared_at: string | null; clear_note: string | null; fee_charged_cents: number | null; appointments: { start_at: string } | null;
  }[]) {
    out[f.client_id]?.flags.push({
      id: f.id,
      type: f.type,
      createdAt: f.created_at,
      appointmentStart: f.appointments?.start_at ?? f.created_at,
      permanent: f.permanent,
      clearedAt: f.cleared_at,
      clearNote: f.clear_note,
      feeCharged: f.fee_charged_cents ?? undefined,
    });
  }
  for (const b of balances.data ?? []) if (out[b.client_id]) out[b.client_id].outstandingBalance += b.amount_cents;
  return out;
}
