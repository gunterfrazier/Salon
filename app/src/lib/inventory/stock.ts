import catalog from "../../../seed/color-catalog.json";

export type Unit = "oz" | "ml" | "g" | "each";
export type Vendor = "saloncentric" | "cosmoprof" | "other";

export interface Product {
  id: string;
  kind: string;
  brand: string;
  line: string | null;
  shade: string | null;
  name: string;
  size: number | null;
  unit: Unit;
  barcode: string | null;
  saloncentricItem: string | null;
  cosmoprofItem: string | null;
  vendor: Vendor | null;
  costCents: number | null;
  priceCents: number | null;
  onHand: number;
  minQty: number | null;
  maxQty: number | null;
  archived: boolean;
}

export const VENDOR_LABEL: Record<Vendor, string> = { saloncentric: "SalonCentric", cosmoprof: "CosmoProf", other: "Other" };

/** Rounds container counts for display: 1.5, 0.25, 3. */
export const qty = (n: number) => String(Math.round(n * 100) / 100);

export type StockLevel = "out" | "low" | "ok" | "untracked";

export function stockLevel(p: Pick<Product, "onHand" | "minQty">): StockLevel {
  if (p.onHand <= 0) return "out";
  if (p.minQty === null) return "untracked";
  return p.onHand <= p.minQty ? "low" : "ok";
}

export interface ReorderLine {
  product: Product;
  /** Whole containers to order. */
  order: number;
  itemNumber: string | null;
}

/**
 * What to order: everything at or below its minimum, up to its maximum
 * (or one above the minimum when no maximum is set), grouped by supplier.
 */
export function reorderList(products: Product[]): { vendor: Vendor | null; lines: ReorderLine[]; costCents: number }[] {
  const groups = new Map<Vendor | null, ReorderLine[]>();
  for (const p of products) {
    if (p.archived || p.minQty === null || p.onHand > p.minQty) continue;
    const target = p.maxQty ?? p.minQty + 1;
    const order = Math.max(1, Math.ceil(target - p.onHand - 1e-9));
    const itemNumber = p.vendor === "saloncentric" ? p.saloncentricItem : p.vendor === "cosmoprof" ? p.cosmoprofItem : null;
    const list = groups.get(p.vendor) ?? [];
    list.push({ product: p, order, itemNumber });
    groups.set(p.vendor, list);
  }
  const rank = (v: Vendor | null) => (v === "saloncentric" ? 0 : v === "cosmoprof" ? 1 : v === "other" ? 2 : 3);
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([vendor, lines]) => ({
      vendor,
      lines: lines.sort((a, b) => a.product.brand.localeCompare(b.product.brand) || (a.product.line ?? "").localeCompare(b.product.line ?? "") || shadeOrder(a.product, b.product)),
      costCents: lines.reduce((n, l) => n + (l.product.costCents ?? 0) * l.order, 0),
    }));
}

/** Natural shade order: 4N before 10N. */
function shadeOrder(a: Product, b: Product): number {
  return (a.shade ?? a.name).localeCompare(b.shade ?? b.name, "en", { numeric: true });
}

const ML_PER_OZ = 29.5735;

/**
 * How many containers a measured amount is. Color creams and liquids are close
 * enough to 1 g per ml for this (scales weigh in grams).
 */
export function containersUsed(amount: number, unit: Unit | "container", p: Pick<Product, "size" | "unit">): number | null {
  if (!(amount > 0)) return null;
  if (unit === "container") return amount;
  if (!p.size) return null;
  if (unit === p.unit) return amount / p.size;
  if (unit === "each" || p.unit === "each") return null;
  const ml = (n: number, u: Unit) => (u === "oz" ? n * ML_PER_OZ : n); // g ≈ ml
  return ml(amount, unit) / ml(p.size, p.unit);
}

/** "1.5 tubes (75%)": usage as containers and as a percentage of one. */
export function usageLabel(containers: number, kind = "color"): string {
  const word = kind === "developer" || kind === "care" ? "bottle" : "tube";
  const n = Math.round(containers * 100) / 100;
  return `${qty(n)} ${word}${n === 1 ? "" : "s"} (${Math.round(containers * 100)}%)`;
}

export interface SupplyWarning {
  product: Product;
  needed: number;
}

/** Products the client's last formula used more of than is on hand now. */
export function supplyCheck(lastUsage: { productId: string; containers: number }[], products: Map<string, Product>): SupplyWarning[] {
  const need = new Map<string, number>();
  for (const u of lastUsage) need.set(u.productId, (need.get(u.productId) ?? 0) + u.containers);
  const out: SupplyWarning[] = [];
  for (const [id, needed] of need) {
    const p = products.get(id);
    if (p && !p.archived && p.onHand + 1e-9 < needed) out.push({ product: p, needed });
  }
  return out;
}

// --- Catalog (seed/color-catalog.json) -------------------------------------

export interface CatalogLine {
  brand: string;
  line: string;
  kind: string;
  shades: { code: string; name?: string | null; family: string; types?: string[] }[];
}

export function catalogLines(): CatalogLine[] {
  return catalog.brands.flatMap((b) =>
    b.lines.map((l) => ({
      brand: b.brand,
      line: l.line,
      kind: /lightener/.test(l.kind) ? "lightener" : "color",
      shades: l.shades.map((s) => ({ code: s.code, name: "name" in s ? (s.name as string | null) : null, family: s.family, types: "types" in s ? (s.types as string[]) : undefined })),
    })),
  );
}

/** Products to create for chosen shades of one catalog line (one per shade, or per type when a shade comes in two). */
export function productsFromCatalog(
  line: CatalogLine,
  pick: { code: string; type?: string; barcode?: string | null }[],
  opts: { size: number | null; unit: Unit; vendor: Vendor | null; minQty: number | null; maxQty: number | null; costCents: number | null },
) {
  const byCode = new Map(line.shades.map((s) => [s.code, s]));
  return pick
    .filter((x) => byCode.has(x.code))
    .map((x) => {
      const s = byCode.get(x.code)!;
      const typeLabel = x.type ? TYPE_LABEL[x.type] ?? x.type : null;
      const lineName = typeLabel ? `${line.line} ${typeLabel}` : line.line;
      return {
        kind: line.kind,
        brand: line.brand,
        line: lineName,
        shade: s.code,
        name: `${s.code}${s.name ? ` ${s.name}` : ""}`,
        size: opts.size,
        unit: opts.unit,
        vendor: opts.vendor,
        min_qty: opts.minQty,
        max_qty: opts.maxQty,
        cost_cents: opts.costCents,
        ...(x.barcode ? { barcode: x.barcode.slice(0, 64) } : {}),
      };
    });
}

export const TYPE_LABEL: Record<string, string> = { permanent: "Permanent", demi: "Demi", gloss: "Gloss", bonder_inside: "Bonder Inside" };

/** Brand for the line names used in the catalog (Kenra Professional → Kenra). */
export const shortBrand = (b: string) => b.replace(/ Professionals?$/, "");

/** "Redken Shades EQ Gloss", without repeating the brand ("Kenra Color Permanent", not "Kenra Kenra Color…"). */
export function lineTitle(p: { brand: string; line: string | null }): string {
  const brand = shortBrand(p.brand);
  if (!p.line) return brand;
  return p.line.toLowerCase().startsWith(brand.toLowerCase()) ? p.line : `${brand} ${p.line}`;
}

/** One pickable catalog item: a shade in a line (and a type, when the shade comes in more than one). */
export interface CatalogItem {
  key: string;
  brand: string;
  line: string;
  type: string | null;
  code: string;
  name: string | null;
  family: string;
  /** "Kenra Color Permanent" */
  lineLabel: string;
}

export function catalogItems(lines: CatalogLine[] = catalogLines()): CatalogItem[] {
  return lines.flatMap((l) =>
    l.shades.flatMap((s) => {
      const types = s.types?.length ? s.types : [null];
      return types.map((t) => ({
        key: `${l.brand}|${l.line}|${t ?? ""}|${s.code}`,
        brand: l.brand,
        line: l.line,
        type: t,
        code: s.code,
        name: s.name ?? null,
        family: s.family,
        lineLabel: lineTitle({ brand: l.brand, line: t ? `${l.line} ${TYPE_LABEL[t] ?? t}` : l.line }),
      }));
    }),
  );
}

/** Type-to-find over the catalog: every word must match; exact shade codes first. */
export function searchCatalog(items: CatalogItem[], q: string, limit = 12): CatalogItem[] {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = items.filter((i) => {
    const hay = `${i.lineLabel} ${i.code} ${i.name ?? ""} ${i.family}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const exact = (i: CatalogItem) => (words.some((w) => i.code.toLowerCase() === w) ? 0 : words.some((w) => i.code.toLowerCase().startsWith(w)) ? 1 : 2);
  return hits.sort((a, b) => exact(a) - exact(b) || a.lineLabel.localeCompare(b.lineLabel) || a.code.localeCompare(b.code, "en", { numeric: true })).slice(0, limit);
}

/** Is this catalog item already a product? (same brand, line name and shade) */
export function inInventory(i: CatalogItem, products: Pick<Product, "brand" | "line" | "shade" | "archived">[]): boolean {
  const line = i.type ? `${i.line} ${TYPE_LABEL[i.type] ?? i.type}` : i.line;
  return products.some((p) => !p.archived && p.brand === i.brand && (p.line ?? "") === line && (p.shade ?? "").toLowerCase() === i.code.toLowerCase());
}
