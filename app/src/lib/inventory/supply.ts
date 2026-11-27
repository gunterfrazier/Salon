/** Brands, lines and usual pack sizes (seed/supply-catalog.json) to speed up adding products by hand. */
import data from "../../../seed/supply-catalog.json";

export interface LineInfo {
  brand: string;
  line: string;
  category: string;
  /** Product type in the app: color, developer or lightener. */
  kind: "color" | "developer" | "lightener";
  size: number | null;
  unit: "oz" | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#+]+/g, " ").trim();

/** "Tube (2.5 oz)" → 2.5 oz; "Tub" → nothing. */
export function parseSize(uom: string): { size: number | null; unit: "oz" | null } {
  const m = /([\d.]+)\s*oz/i.exec(uom);
  return m ? { size: Number(m[1]), unit: "oz" } : { size: null, unit: null };
}

function kindFor(category: string): LineInfo["kind"] {
  if (/lightener/i.test(category)) return "lightener";
  if (/developer/i.test(category)) return "developer";
  return "color";
}

const COLOR_LINES: LineInfo[] = (data.colorLines as string[][]).map(([brand, line, category, uom]) => ({ brand, line, category, kind: kindFor(category), ...parseSize(uom) }));

export const SUPPLY_BRANDS: string[] = data.brands.map((b) => b.name);

/** The catalog's name for a brand typed loosely ("kenra" → "Kenra Professional", "wella" → "Wella Professionals"). */
export function findBrand(typed: string): string | null {
  const t = norm(typed);
  if (!t) return null;
  return SUPPLY_BRANDS.find((b) => norm(b) === t) ?? SUPPLY_BRANDS.find((b) => norm(b).split(" ")[0] === t) ?? null;
}

/** Lines to suggest for a brand: its color lines first, then its other well-known lines. */
export function linesFor(typedBrand: string): string[] {
  const brand = findBrand(typedBrand);
  if (!brand) return [];
  const color = COLOR_LINES.filter((l) => l.brand === brand).map((l) => l.line);
  const other = data.brands.find((b) => b.name === brand)?.lines ?? [];
  return [...new Set([...color, ...other])];
}

/** What we know about a brand + line: its type and usual size. */
export function lineInfo(typedBrand: string, typedLine: string): LineInfo | null {
  const brand = findBrand(typedBrand);
  const line = norm(typedLine);
  if (!brand || !line) return null;
  return COLOR_LINES.find((l) => l.brand === brand && norm(l.line) === line) ?? null;
}

/** Where a brand is usually sold ("CosmoProf, SalonCentric"). */
export function soldAt(typedBrand: string): string[] {
  const brand = findBrand(typedBrand);
  return (brand && data.brands.find((b) => b.name === brand)?.sold) || [];
}
