"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import { cleanPlaylist, cleanSettings, fromTemplate, TEMPLATES } from "@/lib/screens/slides";
import type { CardData } from "@/components/screens/ClientCard";
import { formatDay, wallParts } from "@/lib/time/zone";

/** Client lookup for the color-bar screen (needs "See and add color formulas"). */
export async function screenClientSearch(q: string): Promise<{ id: string; name: string; phone: string | null }[]> {
  const ctx = await getContext();
  if (!ctx.can("formulas")) return [];
  const t = q.trim().slice(0, 40);
  if (t.length < 2) return [];
  const digits = t.replace(/\D/g, "");
  const like = `%${t.replace(/[%_,()]/g, "")}%`;
  let query = ctx.supabase.from("clients").select("id,first_name,last_name,phone").eq("business_id", ctx.business.id).limit(8);
  query = digits.length >= 4 ? query.ilike("phone", `%${digits.slice(-4)}%`) : query.or(`first_name.ilike.${like},last_name.ilike.${like}`);
  const { data } = await query;
  return (data ?? []).map((c) => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" "), phone: c.phone }));
}

export async function screenClientCard(id: string): Promise<CardData | null> {
  const ctx = await getContext();
  if (!ctx.can("formulas") || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const tz = ctx.business.timezone;
  const [{ data: c }, { data: f }, { data: last }] = await Promise.all([
    ctx.supabase.from("clients").select("first_name,last_name,phone,notes").eq("id", id).eq("business_id", ctx.business.id).maybeSingle(),
    ctx.supabase.from("color_formulas").select("created_at,formula_text,developer,processing_min,notes").eq("client_id", id).order("created_at", { ascending: false }).limit(5),
    ctx.supabase.from("appointments").select("start_at").eq("client_id", id).eq("business_id", ctx.business.id).eq("status", "completed").order("start_at", { ascending: false }).limit(1),
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

// ---------------------------------------------------------------------------
// Managing screens (needs "Edit the salon profile")
// ---------------------------------------------------------------------------

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function canManage(ctx: Awaited<ReturnType<typeof getContext>>): { ok: false; error: string } | null {
  return ctx.can("settings.salon") ? null : { ok: false, error: "Your access doesn't include setting up screens." };
}

function refresh() {
  revalidatePath("/app/screens");
  revalidatePath("/app/front-desk");
}

/** A new screen from a ready-made playlist. */
export async function createScreen(templateKey: string, name: string): Promise<Result<{ id: string }>> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  const t = TEMPLATES.find((x) => x.key === templateKey);
  if (!t) return { ok: false, error: "Pick a kind of screen." };
  const n = name.trim().slice(0, 60) || t.name;
  const { data, error } = await ctx.supabase
    .from("screens")
    .insert({ business_id: ctx.business.id, name: n, audience: t.audience, playlist: fromTemplate(t), settings: { touch: t.touch, header: true } })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't add the screen." };
  refresh();
  return { ok: true, id: data.id as string };
}

export interface ScreenEdit {
  name: string;
  audience: "public" | "staff";
  settings: { touch: boolean; header: boolean };
  playlist: unknown;
}

export async function saveScreen(id: string, e: ScreenEdit): Promise<Result> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  const audience = e.audience === "staff" ? "staff" : "public";
  const name = e.name.trim().slice(0, 60);
  if (!name) return { ok: false, error: "Give the screen a name." };
  const { error } = await ctx.supabase
    .from("screens")
    .update({ name, audience, settings: cleanSettings(e.settings), playlist: cleanPlaylist(e.playlist, audience), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't save." };
  refresh();
  revalidatePath(`/app/screens/${id}`);
  return { ok: true };
}

export async function deleteScreen(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  const { error } = await ctx.supabase.from("screens").delete().eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't remove it." };
  refresh();
  return { ok: true };
}

/** A new private link: the old one stops working (e.g. a TV was given away). */
export async function newScreenLink(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  const { error } = await ctx.supabase.from("screens").update({ token }).eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't make a new link." };
  refresh();
  revalidatePath(`/app/screens/${id}`);
  return { ok: true };
}

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Add a picture for screens: a Graphics studio design, an upload, or brand material. */
export async function uploadScreenImage(form: FormData): Promise<Result<{ id: string }>> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  const file = form.get("file");
  const source = ["upload", "studio", "brand"].includes(String(form.get("source"))) ? String(form.get("source")) : "upload";
  const title = String(form.get("title") ?? "").trim().slice(0, 80) || null;
  if (!(file instanceof File) || !TYPES[file.type]) return { ok: false, error: "Use a JPG, PNG or WebP picture." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "That picture is too large (5 MB max)." };
  const path = `${ctx.business.id}/screens/${crypto.randomUUID()}.${TYPES[file.type]}`;
  const { error } = await ctx.supabase.storage.from("salon-media").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };
  const { data, error: e2 } = await ctx.supabase.from("signage_media").insert({ business_id: ctx.business.id, path, title, source }).select("id").single();
  if (e2) {
    await ctx.supabase.storage.from("salon-media").remove([path]);
    return { ok: false, error: "Couldn't save the picture." };
  }
  refresh();
  return { ok: true, id: data.id as string };
}

export async function deleteScreenImage(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  const { data } = await ctx.supabase.from("signage_media").delete().eq("id", id).eq("business_id", ctx.business.id).select("path").maybeSingle();
  if (data?.path) await ctx.supabase.storage.from("salon-media").remove([data.path as string]);
  refresh();
  return { ok: true };
}
