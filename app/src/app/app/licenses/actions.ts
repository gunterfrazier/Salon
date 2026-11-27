"use server";

import { revalidatePath } from "next/cache";
import { getContext, type Ctx } from "@/lib/context";
import { LICENSE_BUCKET, syncBookingExpiry } from "@/lib/licenses/server";
import { cleanLicense } from "@/lib/licenses/rules";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };
const MAX_BYTES = 10 * 1024 * 1024;

function done() {
  revalidatePath("/app/licenses");
}

/** Folder for uploads: the person's own, or the salon's. */
const folderFor = (ctx: Ctx, target: "me" | "salon") => (target === "me" ? `u-${ctx.user.id}` : `b-${ctx.business.id}`);

/** A one-time upload address for a license photo or PDF (up to 10 MB). */
export async function startLicenseUpload(target: "me" | "salon", type: string, size: number): Promise<{ ok: true; url: string; path: string } | { ok: false; error: string }> {
  const ctx = await getContext();
  if (target === "salon" && !ctx.can("settings.salon")) return { ok: false, error: "Only people who edit the salon profile can add the salon's license." };
  const ext = TYPES[type];
  if (!ext) return { ok: false, error: "Upload a photo (JPG, PNG, HEIC) or a PDF." };
  if (!(size > 0 && size <= MAX_BYTES)) return { ok: false, error: "That file is over 10 MB. Take a photo instead, or shrink the PDF." };
  const path = `${folderFor(ctx, target)}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from(LICENSE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Couldn't start the upload. Try again." };
  return { ok: true, url: data.signedUrl, path };
}

/** Add or update a license: yours, or the salon's own. Changing the number or date asks salons to confirm it again. */
export async function saveLicense(input: { id?: string | null; target: "me" | "salon"; license: unknown; file?: { path: string; type: string } | null }): Promise<Result> {
  const ctx = await getContext();
  const salon = input.target === "salon";
  if (salon && !ctx.can("settings.salon")) return { ok: false, error: "Only people who edit the salon profile can change the salon's license." };
  const clean = cleanLicense(input.license, { establishment: salon });
  if (!clean.ok) return clean;
  const file = input.file && input.file.path.startsWith(`${folderFor(ctx, input.target)}/`) && TYPES[input.file.type] ? input.file : null;
  if (input.file && !file) return { ok: false, error: "Upload the file again." };
  const db = createAdminClient();
  const owner = salon ? { business_id: ctx.business.id } : { auth_user_id: ctx.user.id };

  if (input.id) {
    if (!UUID.test(input.id)) return { ok: false, error: "Refresh and try again." };
    let q = db.from("licenses").select("id,number,expires_on,state,kind,file_path").eq("id", input.id);
    q = salon ? q.eq("business_id", ctx.business.id) : q.eq("auth_user_id", ctx.user.id);
    const { data: old } = await q.maybeSingle();
    if (!old) return { ok: false, error: "That license wasn't found. Refresh and try again." };
    const changed = old.number !== clean.value.number || old.expires_on !== clean.value.expires_on || old.state !== clean.value.state || old.kind !== clean.value.kind || !!file;
    const { error } = await db.from("licenses").update({ ...clean.value, ...(file ? { file_path: file.path, file_type: file.type } : {}), updated_at: new Date().toISOString() }).eq("id", old.id);
    if (error) return { ok: false, error: error.message };
    if (file && old.file_path) await db.storage.from(LICENSE_BUCKET).remove([old.file_path]);
    if (changed) await db.from("license_checks").delete().eq("license_id", old.id);
  } else {
    const { error } = await db.from("licenses").insert({ ...owner, ...clean.value, file_path: file?.path ?? null, file_type: file?.type ?? null });
    if (error) return { ok: false, error: error.message };
  }
  if (!salon) await syncBookingExpiry(db, ctx.user.id);
  done();
  return { ok: true };
}

export async function deleteLicense(id: string): Promise<Result> {
  const ctx = await getContext();
  if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
  const db = createAdminClient();
  const { data: l } = await db.from("licenses").select("id,auth_user_id,business_id,file_path").eq("id", id).maybeSingle();
  const mine = l?.auth_user_id === ctx.user.id;
  const salons = l?.business_id === ctx.business.id && ctx.can("settings.salon");
  if (!l || !(mine || salons)) return { ok: false, error: "That license wasn't found." };
  const { error } = await db.from("licenses").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (l.file_path) await db.storage.from(LICENSE_BUCKET).remove([l.file_path as string]);
  if (mine) await syncBookingExpiry(db, ctx.user.id);
  done();
  return { ok: true };
}

/** Whether this person may see a license: their own, the salon's, or (managing the team) a teammate's. */
async function mayView(ctx: Ctx, l: { auth_user_id: string | null; business_id: string | null }): Promise<boolean> {
  if (l.auth_user_id === ctx.user.id) return true;
  if (l.business_id) return l.business_id === ctx.business.id;
  if (!ctx.can("team.manage")) return false;
  const { data } = await createAdminClient().from("staff").select("id").eq("business_id", ctx.business.id).eq("auth_user_id", l.auth_user_id!).eq("active", true).limit(1);
  return !!data?.length;
}

/** A short-lived link to a license's photo or PDF. */
export async function licenseFileUrl(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await getContext();
  if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
  const db = createAdminClient();
  const { data: l } = await db.from("licenses").select("auth_user_id,business_id,file_path").eq("id", id).maybeSingle();
  if (!l?.file_path || !(await mayView(ctx, l))) return { ok: false, error: "No file to show." };
  const { data, error } = await db.storage.from(LICENSE_BUCKET).createSignedUrl(l.file_path as string, 120);
  if (error || !data) return { ok: false, error: "Couldn't open the file. Try again." };
  return { ok: true, url: data.signedUrl };
}

/** The salon confirms a teammate's license (after checking it with the state board), or takes that back. */
export async function confirmLicense(id: string, confirmed: boolean, note: string): Promise<Result> {
  const ctx = await getContext();
  if (!ctx.can("team.manage")) return { ok: false, error: "Your role doesn't allow this. Ask the salon owner." };
  if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
  const db = createAdminClient();
  const { data: l } = await db.from("licenses").select("auth_user_id,business_id").eq("id", id).maybeSingle();
  if (!l || !(await mayView(ctx, l))) return { ok: false, error: "That license wasn't found." };
  if (confirmed) {
    const { error } = await db.from("license_checks").upsert({ license_id: id, business_id: ctx.business.id, verified_at: new Date().toISOString(), verified_by: ctx.staff.id, note: note.trim().slice(0, 200) || null });
    if (error) return { ok: false, error: error.message };
  } else {
    await db.from("license_checks").delete().eq("license_id", id).eq("business_id", ctx.business.id);
  }
  done();
  return { ok: true };
}

/** Salon choice: don't offer stylists for booking once their license has expired. */
export async function setBlockExpired(on: boolean): Promise<Result> {
  const ctx = await getContext();
  if (!ctx.can("team.manage")) return { ok: false, error: "Your role doesn't allow this. Ask the salon owner." };
  const { error } = await ctx.supabase.from("businesses").update({ block_expired_license: !!on }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  done();
  revalidatePath("/app/calendar");
  return { ok: true };
}
