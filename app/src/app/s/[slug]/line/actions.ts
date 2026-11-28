"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { joinLine, lineBusinessBySlug } from "@/lib/walkins/server";

const recent = new Map<string, number[]>();

/** Join a salon's line from its page. Returns the status link. */
export async function joinOnline(input: { slug: string; name: string; phone: string; serviceIds: string[]; requested: string | null; website?: string }): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (input.website) return { ok: false, error: "Something went wrong." }; // honeypot
  // A light limit per address, so the line can't be flooded.
  const ip = (await headers()).get("cf-connecting-ip") ?? "x";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (hits.length >= 5) return { ok: false, error: "Too many tries. Wait a few minutes." };
  recent.set(ip, [...hits, now]);
  const db = createAdminClient();
  const b = await lineBusinessBySlug(db, String(input.slug));
  if (!b) return { ok: false, error: "Salon not found." };
  const r = await joinLine(db, b, { name: String(input.name), phone: String(input.phone ?? ""), serviceIds: Array.isArray(input.serviceIds) ? input.serviceIds.map(String) : [], requested: input.requested ? String(input.requested) : null, source: "online" });
  return r.ok ? { ok: true, token: r.token } : r;
}
