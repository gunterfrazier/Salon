"use server";

import { cookies } from "next/headers";
import type { CardData } from "@/components/screens/ClientCard";
import { pairedDevice } from "@/lib/screens/device";
import { cleanPlaylist, cleanSettings } from "@/lib/screens/slides";
import { DEVICE_COOKIE } from "@/lib/screens/pairing";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDay, wallParts } from "@/lib/time/zone";

/** The paired TV's staff screen, if it has a Client card slide (the only reason a TV may look up clients). */
async function lookupScreen() {
  const d = await pairedDevice();
  if (!d) return null;
  const db = createAdminClient();
  const { data: s } = await db.from("screens").select("audience,playlist").eq("id", d.screenId).maybeSingle();
  if (!s || s.audience !== "staff" || !cleanPlaylist(s.playlist, "staff").some((x) => x.type === "clientcard")) return null;
  return { db, businessId: d.businessId };
}

export async function tvClientSearch(q: string): Promise<{ id: string; name: string; phone: string | null }[]> {
  const ok = await lookupScreen();
  const t = q.trim().slice(0, 40);
  if (!ok || t.length < 2) return [];
  const digits = t.replace(/\D/g, "");
  const like = `%${t.replace(/[%_,()]/g, "")}%`;
  let query = ok.db.from("clients").select("id,first_name,last_name,phone").eq("business_id", ok.businessId).limit(8);
  query = digits.length >= 4 ? query.ilike("phone", `%${digits.slice(-4)}%`) : query.or(`first_name.ilike.${like},last_name.ilike.${like}`);
  const { data } = await query;
  return (data ?? []).map((c) => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" "), phone: c.phone }));
}

export async function tvClientCard(id: string): Promise<CardData | null> {
  const ok = await lookupScreen();
  if (!ok || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data: b } = await ok.db.from("businesses").select("timezone").eq("id", ok.businessId).single();
  const tz = (b?.timezone as string) ?? "America/Chicago";
  const [{ data: c }, { data: f }, { data: last }] = await Promise.all([
    ok.db.from("clients").select("first_name,last_name,phone,notes").eq("id", id).eq("business_id", ok.businessId).maybeSingle(),
    ok.db.from("color_formulas").select("created_at,formula_text,developer,processing_min,notes").eq("client_id", id).eq("business_id", ok.businessId).order("created_at", { ascending: false }).limit(5),
    ok.db.from("appointments").select("start_at").eq("client_id", id).eq("business_id", ok.businessId).eq("status", "completed").order("start_at", { ascending: false }).limit(1),
  ]);
  if (!c) return null;
  const day = (iso: string) => formatDay(wallParts(new Date(iso), tz).date, { month: "short", day: "numeric", year: "numeric" });
  return {
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    phone: c.phone,
    notes: c.notes,
    lastVisit: last?.[0] ? day(last[0].start_at) : null,
    formulas: (f ?? []).map((x) => ({ date: day(x.created_at), text: x.formula_text, developer: x.developer, minutes: x.processing_min, notes: x.notes })),
  };
}

/** Unpair this TV from the TV itself (needs the screen's exit PIN when one is set). */
export async function unpairThisTv(pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = await pairedDevice();
  const store = await cookies();
  if (!d) {
    store.delete(DEVICE_COOKIE);
    return { ok: true };
  }
  const db = createAdminClient();
  const { data: s } = await db.from("screens").select("settings").eq("id", d.screenId).maybeSingle();
  const want = cleanSettings(s?.settings).exitPin;
  if (want && pin !== want) {
    await new Promise((r) => setTimeout(r, 800));
    return { ok: false, error: "That PIN isn't right." };
  }
  await db.from("screen_devices").delete().eq("id", d.id);
  store.delete(DEVICE_COOKIE);
  return { ok: true };
}
