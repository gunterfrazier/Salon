import "server-only";
import type { getContext } from "../context";
import type { ClientSummary } from "../clients/summary";
import { clientStanding } from "../policy/flags";
import { loadClientStates, reviveClientState } from "./clients";

type Ctx = Awaited<ReturnType<typeof getContext>>;
const OPEN = ["pending", "booked", "confirmed", "checked_in", "in_service"];

export async function loadClientList(ctx: Ctx): Promise<ClientSummary[]> {
  const { supabase, business } = ctx;
  const [clients, upcoming] = await Promise.all([
    supabase.from("clients").select("id,first_name,last_name,phone,email").eq("business_id", business.id).limit(5000),
    supabase.from("appointments").select("client_id,start_at").eq("business_id", business.id).in("status", OPEN).gte("start_at", new Date().toISOString()).order("start_at"),
  ]);
  if (clients.error) throw new Error(clients.error.message);
  if (upcoming.error) throw new Error(upcoming.error.message);

  const rows = clients.data ?? [];
  const states = await loadClientStates(supabase, business.id, rows.map((c) => c.id));
  const next: Record<string, string> = {};
  for (const a of upcoming.data ?? []) next[a.client_id] ??= a.start_at;
  const now = new Date();

  return rows.map((c) => {
    const st = states[c.id];
    const state = st ? reviveClientState(st) : null;
    const standing = state ? clientStanding(state, business.policy_settings, now) : null;
    const active = standing?.history.find((h) => h.state === "active" || h.state === "permanent");
    const visits = st ? [...st.onTimeVisits].sort() : [];
    return {
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      phone: c.phone,
      email: c.email,
      lastVisit: visits.length ? new Date(visits[visits.length - 1]).toISOString() : null,
      nextVisit: next[c.id] ? new Date(next[c.id]).toISOString() : null,
      visits: (st?.onTimeVisits.length ?? 0) + (st?.priorVisitCount ?? 0),
      balance: st?.outstandingBalance ?? 0,
      standing: standing?.standing ?? "clear",
      activeFlag: active ? active.flag.type : null,
    };
  });
}
