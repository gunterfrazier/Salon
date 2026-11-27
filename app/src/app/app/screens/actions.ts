"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import { cleanPlaylist, cleanSettings, fromTemplate, TEMPLATES } from "@/lib/screens/slides";
import { newKey, normalizeCode, sha256 } from "@/lib/screens/pairing";
import { createAdminClient } from "@/lib/supabase/admin";
import { backControl, cleanControl, jumpControl, nextControl, pauseControl, playControl, type Control } from "@/lib/screens/playback";
import { resolvePlaylist } from "@/lib/screens/resolve";
import type { CardData } from "@/components/screens/ClientCard";
import { addDays, formatDay, todayIn, wallParts, zonedToUtc } from "@/lib/time/zone";

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
  settings: { touch: boolean; header: boolean; exitPin?: string | null };
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

/** Pair the TV showing this code to a screen. */
export async function pairTv(screenId: string, rawCode: string, name: string): Promise<Result> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "Enter the 6-character code shown on the TV." };
  const { data: screen } = await ctx.supabase.from("screens").select("id").eq("id", screenId).eq("business_id", ctx.business.id).maybeSingle();
  if (!screen) return { ok: false, error: "Screen not found." };
  const admin = createAdminClient();
  const { data: row } = await admin.from("screen_pair_codes").select("code,expires_at,device_id").eq("code", code).maybeSingle();
  if (!row || row.device_id || Date.parse(row.expires_at) < Date.now()) {
    await new Promise((r) => setTimeout(r, 800));
    return { ok: false, error: "That code isn't valid. Check the TV for the current code." };
  }
  const key = newKey();
  const { data: dev, error } = await admin
    .from("screen_devices")
    .insert({ business_id: ctx.business.id, screen_id: screenId, name: name.trim().slice(0, 40) || "TV", key_hash: await sha256(key) })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't pair it. Try again." };
  await admin.from("screen_pair_codes").update({ device_id: dev.id, device_key: key }).eq("code", code);
  revalidatePath(`/app/screens/${screenId}`);
  return { ok: true };
}

/** Unpair a TV: it goes back to its setup code. */
export async function removeTv(deviceId: string): Promise<Result> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  const { data } = await ctx.supabase.from("screen_devices").delete().eq("id", deviceId).eq("business_id", ctx.business.id).select("screen_id").maybeSingle();
  if (data) revalidatePath(`/app/screens/${data.screen_id}`);
  return { ok: true };
}

/** Move a paired TV to another screen without pairing again. */
export async function moveTv(deviceId: string, screenId: string): Promise<Result> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  const { data: s } = await ctx.supabase.from("screens").select("id").eq("id", screenId).eq("business_id", ctx.business.id).maybeSingle();
  if (!s) return { ok: false, error: "Screen not found." };
  const { error } = await ctx.supabase.from("screen_devices").update({ screen_id: screenId }).eq("id", deviceId).eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't move it." };
  revalidatePath("/app/screens", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phone remote
// ---------------------------------------------------------------------------

function canRemote(ctx: Awaited<ReturnType<typeof getContext>>): { ok: false; error: string } | null {
  return ctx.can("settings.salon") || ctx.can("booking.manage") ? null : { ok: false, error: "Your access doesn't include the screen remote." };
}

async function writeControl(ctx: Awaited<ReturnType<typeof getContext>>, id: string, control: Control) {
  const { error } = await ctx.supabase.from("screens").update({ control }).eq("id", id).eq("business_id", ctx.business.id);
  revalidatePath(`/app/screens/${id}/remote`);
  return error ? { ok: false as const, error: "Couldn't reach the screen." } : { ok: true as const };
}

/** Next, back, pause, play, or jump to a slide, on every TV showing this screen. */
export async function remoteCommand(id: string, cmd: "next" | "back" | "pause" | "play" | "jump", index = 0): Promise<Result> {
  const ctx = await getContext();
  const no = canRemote(ctx);
  if (no) return no;
  const p = await resolvePlaylist(ctx.supabase, ctx.business.id, id);
  if (!p) return { ok: false, error: "Screen not found." };
  const secs = p.slides.map((s) => s.seconds);
  const now = Date.now();
  const c = p.control;
  const next =
    cmd === "next" ? nextControl(secs, now, c)
    : cmd === "back" ? backControl(secs, now, c)
    : cmd === "pause" ? pauseControl(now, c)
    : cmd === "play" ? playControl(now, c)
    : jumpControl(secs, now, c, Math.max(0, Math.min(secs.length - 1, Math.round(index))));
  return writeControl(ctx, id, next);
}

/** "Play something else" for a while, or back to the schedule (screenId null). */
export async function remoteOverride(id: string, screenId: string | null, howLong: "hour" | "today" | "until"): Promise<Result> {
  const ctx = await getContext();
  const no = canRemote(ctx);
  if (no) return no;
  const { data: s } = await ctx.supabase.from("screens").select("control").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!s) return { ok: false, error: "Screen not found." };
  const c = cleanControl(s.control);
  if (!screenId) return writeControl(ctx, id, { ...c, override: null, pausedAt: null });
  const { data: other } = await ctx.supabase.from("screens").select("id").eq("id", screenId).eq("business_id", ctx.business.id).maybeSingle();
  if (!other) return { ok: false, error: "Pick a screen to play." };
  const tz = ctx.business.timezone;
  const until = howLong === "hour" ? Date.now() + 3_600_000 : howLong === "today" ? zonedToUtc(addDays(todayIn(tz), 1), 0, tz).getTime() : Date.now() + 30 * 86_400_000;
  return writeControl(ctx, id, { ...c, override: { screenId, until }, pausedAt: null });
}

// ---------------------------------------------------------------------------
// Videos for screens: uploaded straight from the browser to storage
// (too big to pass through the app), then recorded here.
// ---------------------------------------------------------------------------

const VIDEO: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };
const VIDEO_MAX = 50 * 1024 * 1024;

/** A one-time upload link for a video. */
export async function startVideoUpload(type: string, size: number): Promise<Result<{ path: string; url: string }>> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  if (!VIDEO[type]) return { ok: false, error: "Use an MP4 or WebM video." };
  if (!Number.isFinite(size) || size <= 0 || size > VIDEO_MAX) return { ok: false, error: "Videos can be up to 50 MB. Try a shorter clip." };
  const path = `${ctx.business.id}/screens/${crypto.randomUUID()}.${VIDEO[type]}`;
  const { data, error } = await ctx.supabase.storage.from("salon-media").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Couldn't start the upload." };
  return { ok: true, path, url: data.signedUrl };
}

/** Record a video once it has finished uploading. */
export async function finishVideoUpload(path: string, title: string): Promise<Result<{ id: string }>> {
  const ctx = await getContext();
  const no = canManage(ctx);
  if (no) return no;
  const prefix = `${ctx.business.id}/screens/`;
  const file = path.slice(prefix.length);
  if (!path.startsWith(prefix) || !/^[0-9a-f-]{36}\.(mp4|webm)$/.test(file)) return { ok: false, error: "Upload not found." };
  const { data: found } = await ctx.supabase.storage.from("salon-media").list(`${ctx.business.id}/screens`, { search: file, limit: 1 });
  if (!found?.some((f) => f.name === file)) return { ok: false, error: "The upload didn't finish. Try again." };
  const { data, error } = await ctx.supabase.from("signage_media").insert({ business_id: ctx.business.id, path, title: title.trim().slice(0, 80) || "Video", source: "upload", kind: "video" }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save the video." };
  refresh();
  return { ok: true, id: data.id as string };
}
