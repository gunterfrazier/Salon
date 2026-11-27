"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { catalogLines, productsFromCatalog, type Unit, type Vendor } from "@/lib/inventory/stock";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UNITS = new Set(["oz", "ml", "g", "each"]);
const VENDORS = new Set(["saloncentric", "cosmoprof", "other"]);
const KINDS = new Set(["color", "developer", "lightener", "treatment", "care", "retail", "supply"]);
const clean = (s: unknown, max = 120) => (typeof s === "string" ? s.trim().slice(0, max) : "") || null;
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

function done() {
  revalidatePath("/app/inventory");
}

export interface CatalogAdd {
  brand: string;
  line: string;
  picks: { code: string; type?: string; barcode?: string | null }[];
  size: number | null;
  unit: Unit;
  vendor: Vendor | null;
  minQty: number | null;
  maxQty: number | null;
  costCents: number | null;
}

/** Add shades from the Kenra/Redken catalog. Shades already in inventory are skipped. */
export async function addFromCatalog(req: CatalogAdd): Promise<Result<{ added: number; skipped: number }>> {
  const line = catalogLines().find((l) => l.brand === req.brand && l.line === req.line);
  if (!line) return { ok: false, error: "Pick a product line." };
  if (!req.picks.length) return { ok: false, error: "Pick at least one shade." };
  if (!UNITS.has(req.unit)) return { ok: false, error: "Pick a size unit." };
  if (req.size !== null && !(req.size > 0 && req.size < 1000)) return { ok: false, error: "Size should be a number like 2 or 60." };
  if (req.minQty !== null && req.maxQty !== null && req.maxQty < req.minQty) return { ok: false, error: "Max can't be less than min." };
  const picks = req.picks.slice(0, 300).map((p) => ({ code: p.code, type: p.type, barcode: typeof p.barcode === "string" && /^[\w-]{4,64}$/.test(p.barcode) ? p.barcode : null }));
  const rows = productsFromCatalog(line, picks, { size: req.size, unit: req.unit, vendor: req.vendor && VENDORS.has(req.vendor) ? req.vendor : null, minQty: req.minQty, maxQty: req.maxQty, costCents: req.costCents });

  const ctx = await getContext();

  const no = denied(ctx, "inventory.manage");

  if (no) return no;
  const { data: existing, error: e1 } = await ctx.supabase.from("products").select("brand,line,shade,name,size").eq("business_id", ctx.business.id);
  if (e1) return { ok: false, error: e1.message };
  const key = (r: { brand: string; line: string | null; shade: string | null; name: string; size: number | null }) => [r.brand, r.line ?? "", r.shade ?? r.name, Number(r.size ?? 0)].join("|").toLowerCase();
  const have = new Set((existing ?? []).map(key));
  const fresh = rows.filter((r) => !have.has(key(r)));
  if (fresh.length) {
    const { error } = await ctx.supabase.from("products").insert(fresh.map((r) => ({ ...r, business_id: ctx.business.id })));
    if (error) return { ok: false, error: error.message };
  }
  // Scanned a barcode for a product that's already here: attach it if it has none.
  for (const r of rows.filter((x) => have.has(key(x)) && "barcode" in x && x.barcode)) {
    await ctx.supabase.from("products").update({ barcode: (r as { barcode: string }).barcode }).eq("business_id", ctx.business.id).eq("brand", r.brand).eq("line", r.line).eq("shade", r.shade).is("barcode", null);
  }
  done();
  return { ok: true, added: fresh.length, skipped: rows.length - fresh.length };
}

export interface ProductFields {
  kind: string;
  brand: string;
  line: string;
  shade: string;
  name: string;
  size: string;
  unit: string;
  barcode: string;
  saloncentricItem: string;
  cosmoprofItem: string;
  vendor: string;
  cost: string;
  price: string;
  minQty: string;
  maxQty: string;
}

function productRow(f: ProductFields): { row: Record<string, unknown> } | { error: string } {
  const brand = clean(f.brand);
  const name = clean(f.name) ?? [clean(f.shade), clean(f.line)].filter(Boolean).join(" ");
  if (!brand) return { error: "Enter the brand." };
  if (!name) return { error: "Enter a name or shade." };
  if (!KINDS.has(f.kind)) return { error: "Pick a type." };
  if (!UNITS.has(f.unit)) return { error: "Pick a size unit." };
  const size = numOrNull(f.size);
  const min = numOrNull(f.minQty);
  const max = numOrNull(f.maxQty);
  const cost = numOrNull(f.cost);
  const price = numOrNull(f.price);
  for (const [v, label] of [[size, "Size"], [min, "Min"], [max, "Max"], [cost, "Cost"], [price, "Price"]] as const) {
    if (v !== null && !(Number.isFinite(v) && v >= 0 && v < 100000)) return { error: `${label} should be a number.` };
  }
  if (min !== null && max !== null && max < min) return { error: "Max can't be less than min." };
  return {
    row: {
      kind: f.kind,
      brand,
      line: clean(f.line),
      shade: clean(f.shade, 40),
      name,
      size,
      unit: f.unit,
      barcode: clean(f.barcode, 64),
      saloncentric_item: clean(f.saloncentricItem, 40),
      cosmoprof_item: clean(f.cosmoprofItem, 40),
      vendor: VENDORS.has(f.vendor) ? f.vendor : null,
      cost_cents: cost === null ? null : Math.round(cost * 100),
      price_cents: price === null ? null : Math.round(price * 100),
      min_qty: min,
      max_qty: max,
    },
  };
}

export async function saveProduct(id: string | null, f: ProductFields): Promise<Result<{ id: string }>> {
  const r = productRow(f);
  if ("error" in r) return { ok: false, error: r.error };
  const ctx = await getContext();
  const no = denied(ctx, "inventory.manage");
  if (no) return no;
  const q = id
    ? ctx.supabase.from("products").update(r.row).eq("business_id", ctx.business.id).eq("id", id).select("id").single()
    : ctx.supabase.from("products").insert({ ...r.row, business_id: ctx.business.id }).select("id").single();
  const { data, error } = await q;
  if (error) return { ok: false, error: error.code === "23505" ? (String(error.message).includes("barcode") ? "Another product already has that barcode." : "That product is already in inventory.") : error.message };
  done();
  return { ok: true, id: data.id as string };
}

export async function archiveProduct(id: string, archived: boolean): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "inventory.manage");
  if (no) return no;
  const { error } = await ctx.supabase.from("products").update({ archived }).eq("business_id", ctx.business.id).eq("id", id);
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

/** Count (set on hand), receive (+), or adjust (±) stock. */
export async function changeStock(productId: string, reason: "count" | "received" | "adjust" | "sold", value: number, note?: string): Promise<Result<{ onHand: number }>> {
  if (!Number.isFinite(value) || Math.abs(value) > 10000) return { ok: false, error: "Enter a number." };
  if (reason === "count" && value < 0) return { ok: false, error: "Count can't be negative." };
  if ((reason === "received" || reason === "sold") && value <= 0) return { ok: false, error: "Enter how many." };
  const ctx = await getContext();
  const no = denied(ctx, "inventory.count");
  if (no) return no;
  const { data, error } = await ctx.supabase.rpc("stock_move", {
    p: { product_id: productId, reason, ...(reason === "count" ? { count: value } : { change: reason === "sold" ? -value : value }), note: clean(note, 200) },
  });
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true, onHand: Number(data) };
}

/** Find a product by barcode (scanner). */
export async function findByBarcode(code: string): Promise<{ id: string; name: string } | null> {
  const c = clean(code, 64);
  if (!c) return null;
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("products").select("id,name,brand").eq("business_id", ctx.business.id).eq("barcode", c).maybeSingle();
  return data ? { id: data.id, name: `${data.brand} ${data.name}` } : null;
}
