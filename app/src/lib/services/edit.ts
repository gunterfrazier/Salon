/**
 * Editing the service menu: checking what someone typed, naming new services,
 * reordering, and working out each stylist's service list when "who offers
 * this" changes. Pure functions; the server actions do the saving.
 */

export const STAGES = [
  { key: "consult", label: "Consultation" },
  { key: "chemical", label: "Color & chemical" },
  { key: "treatment", label: "Treatment" },
  { key: "cut", label: "Cut" },
  { key: "style", label: "Style" },
  { key: "wax", label: "Wax" },
  { key: "fee", label: "Fee" },
] as const;
export type Stage = (typeof STAGES)[number]["key"];

export const PRICE_TYPES = [
  { key: "fixed", label: "Exact price" },
  { key: "starting_at", label: "Starting at (final price at checkout)" },
  { key: "hourly", label: "Per hour" },
  { key: "free", label: "Free" },
] as const;
export type PriceType = (typeof PRICE_TYPES)[number]["key"];

/** What the editor sends. Money is typed in dollars. */
export interface ServiceInput {
  name: string;
  categoryId: string;
  description: string;
  priceType: PriceType;
  price: string;
  active: number;
  processing: number;
  finish: number;
  bookDuringProcessing: boolean;
  depositCategory: "standard" | "color";
  stage: Stage;
  bookableOnline: boolean;
  isAddOn: boolean;
}

/** The columns it becomes. */
export interface ServiceFields {
  name: string;
  category_id: string;
  description: string | null;
  price_type: PriceType;
  price_cents: number;
  active_min: number;
  processing_min: number;
  finish_min: number;
  allow_booking_in_processing: boolean;
  deposit_category: "standard" | "color";
  stage: Stage;
  bookable_online: boolean;
  is_add_on: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MIN = 720;

const minutes = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_MIN ? v : null);

/** Dollars as typed ("35", "$35.50", "1,200") → cents, or null. */
export function dollarsToCents(v: string): number | null {
  const t = String(v ?? "").replace(/[$,\s]/g, "");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export function cleanService(raw: unknown): { ok: true; value: ServiceFields } | { ok: false; error: string } {
  const r = (raw ?? {}) as Partial<ServiceInput>;
  const name = String(r.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give the service a name." };
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };
  if (typeof r.categoryId !== "string" || !UUID.test(r.categoryId)) return { ok: false, error: "Pick a group for the service." };
  const priceType = PRICE_TYPES.some((p) => p.key === r.priceType) ? (r.priceType as PriceType) : null;
  if (!priceType) return { ok: false, error: "Pick how the price works." };
  const cents = priceType === "free" ? 0 : dollarsToCents(r.price ?? "");
  if (cents === null) return { ok: false, error: "Enter the price in dollars, like 35 or 35.50." };
  const active = minutes(r.active);
  const processing = minutes(r.processing);
  const finish = minutes(r.finish);
  if (active === null || processing === null || finish === null) return { ok: false, error: `Times are whole minutes, up to ${MAX_MIN}.` };
  if (active + processing + finish === 0) return { ok: false, error: "How long does it take? Enter the working time in minutes." };
  if (active + processing + finish > MAX_MIN) return { ok: false, error: "That's longer than 12 hours. Check the times." };
  const stage = STAGES.some((s) => s.key === r.stage) ? (r.stage as Stage) : "cut";
  const description = String(r.description ?? "").trim().slice(0, 500);
  return {
    ok: true,
    value: {
      name,
      category_id: r.categoryId,
      description: description || null,
      price_type: priceType,
      price_cents: cents,
      active_min: active,
      processing_min: processing,
      finish_min: finish,
      allow_booking_in_processing: processing > 0 ? r.bookDuringProcessing !== false : true,
      deposit_category: r.depositCategory === "color" ? "color" : "standard",
      stage,
      bookable_online: r.bookableOnline !== false,
      is_add_on: r.isAddOn === true,
    },
  };
}

export function cleanGroupName(v: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give the group a name." };
  if (name.length > 60) return { ok: false, error: "Keep the group name under 60 characters." };
  return { ok: true, name };
}

/** A short unique key from a name ("Women's Cut" → womens_cut, then womens_cut_2…). */
export function uniqueKey(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "item";
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
}

/** The list with one item moved up (-1) or down (+1); unchanged at the ends. */
export function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/**
 * New service lists for stylists after "who offers this service" changes.
 * null means "all services", so taking a service away from such a stylist
 * gives them an explicit list of everything else. Only changed stylists are
 * returned.
 */
export function offerChanges(
  stylists: { id: string; serviceIds: string[] | null }[],
  allServiceIds: string[],
  serviceId: string,
  offeredBy: Iterable<string>,
): { id: string; serviceIds: string[] | null }[] {
  const yes = new Set(offeredBy);
  const out: { id: string; serviceIds: string[] | null }[] = [];
  for (const s of stylists) {
    const want = yes.has(s.id);
    if (s.serviceIds === null) {
      if (!want) out.push({ id: s.id, serviceIds: allServiceIds.filter((id) => id !== serviceId) });
      continue;
    }
    const has = s.serviceIds.includes(serviceId);
    if (want && !has) out.push({ id: s.id, serviceIds: [...s.serviceIds, serviceId] });
    if (!want && has) out.push({ id: s.id, serviceIds: s.serviceIds.filter((id) => id !== serviceId) });
  }
  return out;
}

/** Who offers a service now (for ticking the boxes). */
export const offeredBy = (stylists: { id: string; serviceIds: string[] | null }[], serviceId: string) =>
  stylists.filter((s) => s.serviceIds === null || s.serviceIds.includes(serviceId)).map((s) => s.id);
