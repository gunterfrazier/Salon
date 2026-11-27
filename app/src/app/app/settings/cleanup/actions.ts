"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";

/** Permanently remove practice clients and everything booked or paid for them. */
export async function purgeClients(ids: string[], confirm: string): Promise<{ ok: true; clients: number; appointments: number } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  if (confirm.trim().toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  const list = [...new Set(ids)].filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  if (!list.length) return { ok: false, error: "Pick at least one client." };
  const { data, error } = await ctx.supabase.rpc("purge_clients", { biz: ctx.business.id, ids: list });
  if (error) return { ok: false, error: "Couldn't remove them. Try again." };
  const r = data as { clients: number; appointments: number };
  for (const p of ["/app/settings/cleanup", "/app/clients", "/app/today", "/app/calendar", "/app/reports"]) revalidatePath(p);
  return { ok: true, clients: r.clients, appointments: r.appointments };
}
