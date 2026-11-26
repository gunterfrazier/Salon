"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "") || null;
const METHODS = new Set(["cash", "venmo_direct", "cash_app_direct", "zelle", "paypal_me", "apple_cash", "other"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Load the client only if it belongs to the signed-in user's salon. */
async function ownClient(clientId: string) {
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("clients").select("id").eq("business_id", ctx.business.id).eq("id", clientId).maybeSingle();
  return data ? ctx : null;
}

function done(clientId?: string) {
  revalidatePath("/clients");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
}

export interface ClientFields {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  priorVisitCount?: number;
}

function validate(f: ClientFields): string | null {
  if (!clean(f.firstName)) return "First name is required.";
  const email = clean(f.email);
  if (email && !EMAIL.test(email)) return "That email doesn't look right.";
  if (f.priorVisitCount !== undefined && (!Number.isInteger(f.priorVisitCount) || f.priorVisitCount < 0)) return "Past visits must be 0 or more.";
  return null;
}

const row = (f: ClientFields) => ({
  first_name: clean(f.firstName),
  last_name: clean(f.lastName),
  phone: clean(f.phone),
  email: clean(f.email)?.toLowerCase() ?? null,
  notes: clean(f.notes),
  ...(f.priorVisitCount !== undefined ? { prior_visit_count: f.priorVisitCount } : {}),
});

export async function createClientRecord(f: ClientFields): Promise<Result<{ id: string }>> {
  const problem = validate(f);
  if (problem) return { ok: false, error: problem };
  const ctx = await getContext();
  const { data, error } = await ctx.supabase.from("clients").insert({ business_id: ctx.business.id, source: "manual", ...row(f) }).select("id").single();
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true, id: data.id as string };
}

export async function updateClientRecord(clientId: string, f: ClientFields): Promise<Result> {
  const problem = validate(f);
  if (problem) return { ok: false, error: problem };
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "Client not found." };
  const { error } = await ctx.supabase.from("clients").update(row(f)).eq("id", clientId);
  if (error) return { ok: false, error: error.message };
  done(clientId);
  return { ok: true };
}

export async function setDepositRule(clientId: string, rule: { kind: "none" } | { kind: "full" } | { kind: "amount"; cents: number }): Promise<Result> {
  if (rule.kind === "amount" && (!Number.isInteger(rule.cents) || rule.cents <= 0)) return { ok: false, error: "Enter a deposit amount." };
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "Client not found." };
  const { error } = await ctx.supabase
    .from("clients")
    .update({ deposit_override: rule.kind, deposit_override_cents: rule.kind === "amount" ? rule.cents : null })
    .eq("id", clientId);
  if (error) return { ok: false, error: error.message };
  done(clientId);
  return { ok: true };
}

export async function updateFlag(clientId: string, flagId: string, action: "clear" | "permanent" | "unpermanent", note?: string): Promise<Result> {
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "Client not found." };
  const policy = ctx.business.policy_settings;
  let patch: Record<string, unknown>;
  if (action === "clear") {
    if (!policy.flags.stylistCanClearManually) return { ok: false, error: "Clearing flags is turned off in your policy." };
    if (!clean(note)) return { ok: false, error: "Add a short note about why it's cleared." };
    patch = { cleared_at: new Date().toISOString(), cleared_by: ctx.staff.id, clear_note: clean(note), permanent: false };
  } else if (action === "permanent") {
    if (!policy.flags.stylistCanMakePermanent) return { ok: false, error: "Permanent flags are turned off in your policy." };
    patch = { permanent: true, made_permanent_at: new Date().toISOString(), made_permanent_by: ctx.staff.id };
  } else {
    patch = { permanent: false, made_permanent_at: null, made_permanent_by: null };
  }
  const { data, error } = await ctx.supabase.from("client_flags").update(patch).eq("id", flagId).eq("client_id", clientId).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Flag not found." };
  done(clientId);
  return { ok: true };
}

export async function settleBalance(clientId: string, balanceId: string, method: string, reference?: string): Promise<Result> {
  if (!METHODS.has(method)) return { ok: false, error: "Pick how the client paid." };
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "Client not found." };
  const { error } = await ctx.supabase.rpc("settle_balance", { p: { balance_id: balanceId, method, reference: clean(reference) } });
  if (error) return { ok: false, error: error.code === "P0002" ? "This balance is already paid." : error.message };
  done(clientId);
  return { ok: true };
}

export async function markRefundReturned(clientId: string, paymentId: string, method: string, reference?: string): Promise<Result> {
  if (!METHODS.has(method)) return { ok: false, error: "Pick how you returned it." };
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "Client not found." };
  const { data, error } = await ctx.supabase
    .from("payments")
    .update({ status: "succeeded", method, external_reference: clean(reference) })
    .eq("id", paymentId)
    .eq("client_id", clientId)
    .eq("kind", "refund")
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Refund not found or already returned." };
  done(clientId);
  return { ok: true };
}

const MAX_PHOTOS = 6;
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Add a color formula; photos arrive already shrunk by the browser. */
export async function addFormula(clientId: string, form: FormData): Promise<Result> {
  const formula = clean(form.get("formula"));
  if (!formula) return { ok: false, error: "Enter the formula." };
  const minutes = clean(form.get("processing"));
  const processing = minutes ? Number(minutes) : null;
  if (processing !== null && (!Number.isInteger(processing) || processing < 0 || processing > 600)) return { ok: false, error: "Processing time should be minutes, 0–600." };
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > MAX_PHOTOS) return { ok: false, error: `Up to ${MAX_PHOTOS} photos per formula.` };
  for (const p of photos) {
    if (!TYPES[p.type]) return { ok: false, error: "Photos must be JPEG, PNG or WebP." };
    if (p.size > MAX_BYTES) return { ok: false, error: "A photo is too large." };
  }

  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "Client not found." };

  const paths: string[] = [];
  for (const p of photos) {
    const path = `${ctx.business.id}/${clientId}/${crypto.randomUUID()}.${TYPES[p.type]}`;
    const { error } = await ctx.supabase.storage.from("client-photos").upload(path, p, { contentType: p.type });
    if (error) {
      if (paths.length) await ctx.supabase.storage.from("client-photos").remove(paths);
      return { ok: false, error: `Photo upload failed: ${error.message}` };
    }
    paths.push(path);
  }

  const { error } = await ctx.supabase.from("color_formulas").insert({
    business_id: ctx.business.id,
    client_id: clientId,
    formula_text: formula,
    developer: clean(form.get("developer")),
    processing_min: processing,
    notes: clean(form.get("notes")),
    photo_paths: paths,
  });
  if (error) {
    if (paths.length) await ctx.supabase.storage.from("client-photos").remove(paths);
    return { ok: false, error: error.message };
  }
  done(clientId);
  return { ok: true };
}

export async function deleteFormula(clientId: string, formulaId: string): Promise<Result> {
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "Client not found." };
  const { data, error } = await ctx.supabase.from("color_formulas").delete().eq("id", formulaId).eq("client_id", clientId).select("photo_paths");
  if (error) return { ok: false, error: error.message };
  const paths = (data ?? []).flatMap((r) => (r.photo_paths as string[]) ?? []);
  if (paths.length) await ctx.supabase.storage.from("client-photos").remove(paths);
  done(clientId);
  return { ok: true };
}
