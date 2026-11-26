"use server";

import { revalidatePath } from "next/cache";
import { cleanFavorites } from "@/lib/booking/search";
import { getContext } from "@/lib/context";
import { containersUsed, type Unit } from "@/lib/inventory/stock";

/** Products used, sent from the formula form as JSON: [{ productId, amount, unit }]. */
function parseUsage(raw: FormDataEntryValue | null): { productId: string; amount: number; unit: Unit | "container" }[] | null {
  if (!raw || typeof raw !== "string" || !raw.trim()) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length > 12) return null;
    const units = new Set(["oz", "ml", "g", "each", "container"]);
    const out = list.map((u) => ({ productId: String(u?.productId ?? ""), amount: Number(u?.amount), unit: String(u?.unit) as Unit | "container" }));
    return out.every((u) => /^[0-9a-f-]{36}$/.test(u.productId) && u.amount > 0 && u.amount < 10000 && units.has(u.unit)) ? out : null;
  } catch {
    return null;
  }
}

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
  /** The client agreed to get texts from the salon. */
  smsOptIn?: boolean;
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
  ...(f.smsOptIn !== undefined ? { sms_opt_in: f.smsOptIn } : {}),
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

  const usage = parseUsage(form.get("usage"));
  if (usage === null) return { ok: false, error: "Check the products used: each needs a product and an amount." };

  const { data: saved, error } = await ctx.supabase
    .from("color_formulas")
    .insert({
      business_id: ctx.business.id,
      client_id: clientId,
      appointment_id: clean(form.get("appointmentId")),
      formula_text: formula,
      developer: clean(form.get("developer")),
      processing_min: processing,
      notes: clean(form.get("notes")),
      photo_paths: paths,
    })
    .select("id")
    .single();
  if (error) {
    if (paths.length) await ctx.supabase.storage.from("client-photos").remove(paths);
    return { ok: false, error: error.message };
  }

  // Take what was used out of inventory.
  if (usage.length) {
    const { data: prods } = await ctx.supabase.from("products").select("id,size,unit").eq("business_id", ctx.business.id).in("id", usage.map((u) => u.productId));
    const byId = new Map((prods ?? []).map((p) => [p.id as string, { size: p.size === null ? null : Number(p.size), unit: p.unit as Unit }]));
    const problems: string[] = [];
    for (const u of usage) {
      const p = byId.get(u.productId);
      const containers = p ? containersUsed(u.amount, u.unit, p) : null;
      if (containers === null) {
        problems.push("a product without a size (set its size in Inventory, or enter tubes)");
        continue;
      }
      const { error: moveErr } = await ctx.supabase.rpc("stock_move", {
        p: { product_id: u.productId, reason: "used", change: -containers, amount: u.amount, unit: u.unit, client_id: clientId, formula_id: saved.id, appointment_id: clean(form.get("appointmentId")) },
      });
      if (moveErr) problems.push(moveErr.message);
    }
    if (problems.length) {
      done(clientId);
      return { ok: false, error: `Formula saved, but inventory wasn't updated for ${problems[0]}.` };
    }
    revalidatePath("/inventory");
  }
  done(clientId);
  return { ok: true };
}

export async function deleteFormula(clientId: string, formulaId: string): Promise<Result> {
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "Client not found." };
  // Put what this formula used back into inventory.
  const { data: used } = await ctx.supabase.from("stock_moves").select("product_id,change").eq("formula_id", formulaId).eq("reason", "used");
  for (const m of used ?? []) {
    await ctx.supabase.rpc("stock_move", { p: { product_id: m.product_id, reason: "adjust", change: -Number(m.change), client_id: clientId, note: "Formula deleted" } });
  }
  if (used?.length) revalidatePath("/inventory");
  const { data, error } = await ctx.supabase.from("color_formulas").delete().eq("id", formulaId).eq("client_id", clientId).select("photo_paths");
  if (error) return { ok: false, error: error.message };
  const paths = (data ?? []).flatMap((r) => (r.photo_paths as string[]) ?? []);
  if (paths.length) await ctx.supabase.storage.from("client-photos").remove(paths);
  done(clientId);
  return { ok: true };
}

export interface ImportClientInput {
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  priorVisits: number;
}

/** Bulk-add clients from an import; duplicates (phone/email) are skipped again here. */
export async function importClients(rows: ImportClientInput[], source: "styleseat_import" | "manual" = "styleseat_import"): Promise<Result<{ imported: number; skipped: number }>> {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "Nothing to import." };
  if (rows.length > 5000) return { ok: false, error: "Import up to 5,000 clients at a time." };
  const ctx = await getContext();
  const { data: existing, error: exErr } = await ctx.supabase.from("clients").select("phone,email").eq("business_id", ctx.business.id).limit(10000);
  if (exErr) return { ok: false, error: exErr.message };

  const digits = (p: string | null) => {
    const d = (p ?? "").replace(/\D/g, "");
    return d.length >= 10 ? d.slice(-10) : d.length >= 7 ? d : "";
  };
  const phones = new Set((existing ?? []).map((c) => digits(c.phone)).filter(Boolean));
  const emails = new Set((existing ?? []).map((c) => (c.email ?? "").toLowerCase()).filter(Boolean));

  const toInsert = [];
  let skipped = 0;
  for (const r of rows) {
    const first = clean(r.firstName);
    const email = clean(r.email)?.toLowerCase() ?? null;
    const phone = clean(r.phone);
    const visits = Number.isInteger(r.priorVisits) && r.priorVisits >= 0 ? Math.min(r.priorVisits, 9999) : 0;
    const pk = digits(phone);
    if (!first || (email && !EMAIL.test(email)) || (pk && phones.has(pk)) || (email && emails.has(email))) {
      skipped++;
      continue;
    }
    if (pk) phones.add(pk);
    if (email) emails.add(email);
    toInsert.push({
      business_id: ctx.business.id,
      first_name: first.slice(0, 100),
      last_name: clean(r.lastName)?.slice(0, 100) ?? null,
      phone: phone?.slice(0, 40) ?? null,
      email,
      notes: clean(r.notes)?.slice(0, 5000) ?? null,
      prior_visit_count: visits,
      source,
    });
  }

  for (let i = 0; i < toInsert.length; i += 200) {
    const { error } = await ctx.supabase.from("clients").insert(toInsert.slice(i, i + 200));
    if (error) return { ok: false, error: `Stopped after ${i} clients: ${error.message}` };
  }
  done();
  return { ok: true, imported: toInsert.length, skipped };
}

export async function saveFavorites(clientId: string, favorites: unknown): Promise<Result> {
  const fav = cleanFavorites(favorites);
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "Client not found." };
  const { error } = await ctx.supabase.from("clients").update({ preferences: fav ?? {} }).eq("id", clientId);
  if (error) return { ok: false, error: error.message };
  done(clientId);
  return { ok: true };
}
