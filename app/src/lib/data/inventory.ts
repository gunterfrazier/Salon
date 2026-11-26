import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lineTitle, qty, supplyCheck, usageLabel, type Product } from "../inventory/stock";

export const PRODUCT_COLS = "id,kind,brand,line,shade,name,size,unit,barcode,saloncentric_item,cosmoprof_item,vendor,cost_cents,price_cents,on_hand,min_qty,max_qty,archived";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function toProduct(r: Row): Product {
  return {
    id: r.id as string,
    kind: r.kind as string,
    brand: r.brand as string,
    line: (r.line as string) ?? null,
    shade: (r.shade as string) ?? null,
    name: r.name as string,
    size: num(r.size),
    unit: r.unit as Product["unit"],
    barcode: (r.barcode as string) ?? null,
    saloncentricItem: (r.saloncentric_item as string) ?? null,
    cosmoprofItem: (r.cosmoprof_item as string) ?? null,
    vendor: (r.vendor as Product["vendor"]) ?? null,
    costCents: num(r.cost_cents),
    priceCents: num(r.price_cents),
    onHand: Number(r.on_hand),
    minQty: num(r.min_qty),
    maxQty: num(r.max_qty),
    archived: !!r.archived,
  };
}

export async function loadProducts(db: SupabaseClient, businessId: string, includeArchived = false): Promise<Product[]> {
  const out: Product[] = [];
  for (let start = 0; ; start += 1000) {
    let q = db.from("products").select(PRODUCT_COLS).eq("business_id", businessId);
    if (!includeArchived) q = q.eq("archived", false);
    const { data, error } = await q.order("brand").order("line").order("name").range(start, start + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map((r) => toProduct(r as Row)));
    if (!data || data.length < 1000) break;
  }
  // Natural shade order within a line (4N before 10N).
  return out.sort((a, b) => a.brand.localeCompare(b.brand) || (a.line ?? "").localeCompare(b.line ?? "") || (a.shade ?? a.name).localeCompare(b.shade ?? b.name, "en", { numeric: true }));
}

/** Last recorded usage (one formula's worth) per client: product → containers. */
export async function lastUsageFor(db: SupabaseClient, businessId: string, clientId: string): Promise<{ formulaId: string | null; at: string; items: { productId: string; containers: number }[] } | null> {
  const { data, error } = await db
    .from("stock_moves")
    .select("product_id,change,formula_id,appointment_id,created_at")
    .eq("business_id", businessId)
    .eq("client_id", clientId)
    .eq("reason", "used")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  if (!data?.length) return null;
  const first = data[0];
  const sameVisit = data.filter((m) => (first.formula_id ? m.formula_id === first.formula_id : first.appointment_id ? m.appointment_id === first.appointment_id : m.created_at === first.created_at));
  return { formulaId: first.formula_id, at: first.created_at, items: sameVisit.map((m) => ({ productId: m.product_id, containers: -Number(m.change) })) };
}

/**
 * Warnings for a client's next visit: products their last formula used more of
 * than is on hand now, e.g. "Last formula used 1.5 tubes (150%) of Kenra Color Permanent 6N; 1 on hand."
 */
export async function supplyWarnings(db: SupabaseClient, businessId: string, clientId: string): Promise<string[]> {
  const last = await lastUsageFor(db, businessId, clientId);
  if (!last?.items.length) return [];
  const { data, error } = await db.from("products").select(PRODUCT_COLS).eq("business_id", businessId).in("id", [...new Set(last.items.map((i) => i.productId))]);
  if (error) throw new Error(error.message);
  const products = new Map((data ?? []).map((r) => [r.id as string, toProduct(r as Row)]));
  return supplyCheck(last.items, products).map((w) => `Last formula used ${usageLabel(w.needed, w.product.kind)} of ${lineTitle(w.product)} ${w.product.name}; ${qty(w.product.onHand)} on hand.`);
}
