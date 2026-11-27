"use server";

import { revalidatePath } from "next/cache";
import { branding } from "@/lib/branding";
import { denied, getContext } from "@/lib/context";

type Result = { ok: true } | { ok: false; error: string };
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 5 * 1024 * 1024;

function refresh(slug?: string | null) {
  revalidatePath("/app/settings/salon");
  if (slug) revalidatePath(`/s/${slug}`);
}

/** Upload a logo, cover photo or portfolio photo (already shrunk on the phone). */
export async function uploadSalonImage(form: FormData): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.salon");
  if (no) return no;
  const kind = String(form.get("kind") ?? "");
  const file = form.get("file");
  if (!["logo", "cover", "photo"].includes(kind)) return { ok: false, error: "Unknown picture." };
  if (!(file instanceof File) || !TYPES[file.type]) return { ok: false, error: "Use a JPG, PNG or WebP picture." };
  if (file.size > MAX) return { ok: false, error: "That picture is too large (5 MB max)." };
  const path = `${ctx.business.id}/${kind}/${crypto.randomUUID()}.${TYPES[file.type]}`;
  const { error } = await ctx.supabase.storage.from("salon-media").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };
  const { data: b } = await ctx.supabase.from("businesses").select("slug,branding").eq("id", ctx.business.id).single();
  if (kind === "photo") {
    const caption = String(form.get("caption") ?? "").trim().slice(0, 140) || null;
    const staffId = String(form.get("staffId") ?? "");
    const { error: e2 } = await ctx.supabase.from("salon_photos").insert({ business_id: ctx.business.id, path, caption, staff_id: /^[0-9a-f-]{36}$/.test(staffId) ? staffId : null });
    if (e2) {
      await ctx.supabase.storage.from("salon-media").remove([path]);
      return { ok: false, error: "Couldn't save the photo." };
    }
  } else {
    const cur = branding(b?.branding);
    const old = kind === "logo" ? cur.logoPath : cur.coverPath;
    const next = { ...cur, [kind === "logo" ? "logoPath" : "coverPath"]: path };
    const { error: e3 } = await ctx.supabase.from("businesses").update({ branding: next }).eq("id", ctx.business.id);
    if (e3) return { ok: false, error: "Couldn't save." };
    if (old) await ctx.supabase.storage.from("salon-media").remove([old]);
  }
  refresh(b?.slug);
  return { ok: true };
}

export async function removeBrandImage(kind: "logo" | "cover"): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.salon");
  if (no) return no;
  const { data: b } = await ctx.supabase.from("businesses").select("slug,branding").eq("id", ctx.business.id).single();
  const cur = branding(b?.branding);
  const old = kind === "logo" ? cur.logoPath : cur.coverPath;
  await ctx.supabase.from("businesses").update({ branding: { ...cur, [kind === "logo" ? "logoPath" : "coverPath"]: null } }).eq("id", ctx.business.id);
  if (old) await ctx.supabase.storage.from("salon-media").remove([old]);
  refresh(b?.slug);
  return { ok: true };
}

export async function setAccent(hex: string | null): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.salon");
  if (no) return no;
  const { data: b } = await ctx.supabase.from("businesses").select("slug,branding").eq("id", ctx.business.id).single();
  const next = branding({ ...branding(b?.branding), accent: hex });
  if (hex && !next.accent) return { ok: false, error: "Pick a color." };
  await ctx.supabase.from("businesses").update({ branding: next }).eq("id", ctx.business.id);
  refresh(b?.slug);
  return { ok: true };
}

export async function deletePhoto(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.salon");
  if (no) return no;
  const { data: p } = await ctx.supabase.from("salon_photos").select("path").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!p) return { ok: false, error: "Photo not found." };
  await ctx.supabase.from("salon_photos").delete().eq("id", id);
  await ctx.supabase.storage.from("salon-media").remove([p.path]);
  const { data: b } = await ctx.supabase.from("businesses").select("slug").eq("id", ctx.business.id).single();
  refresh(b?.slug);
  return { ok: true };
}
