import menuJson from "../../../seed/service-menu.json";
import genericJson from "../../../seed/service-menu-generic.json";
import paymentJson from "../../../seed/payment-methods.json";
import policyJson from "../../../seed/policies.json";
import pricingJson from "../../../seed/pricing-rules.json";

/** Drop "_note"-style comment keys from seed JSON before storing it. */
export function stripNotes<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripNotes) as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(([k]) => !k.startsWith("_")).map(([k, x]) => [k, stripNotes(x)]),
    ) as T;
  }
  return v;
}

type SeedService = {
  key: string; name: string; description?: string; priceType: string; price: number; estimatedHours?: number;
  active: number; processing: number; finish: number; depositCategory: string; stage?: string; includes?: string[];
  isAddOn?: boolean; bookableOnline?: boolean; priceNeedsReview?: boolean; styleSeatPrice?: number; attachesTo?: string[];
};
type SeedMenu = { timezone?: string; hours?: Record<string, [string, string] | null | string>; categories: { key: string; name: string; services: SeedService[] }[] };

/** Starter menu for new salons (general services and typical prices; the salon edits them). */
export const GENERIC_MENU = genericJson as unknown as SeedMenu;

/** Stacking order for services without one: consult, chemical, treatment, cut, style, wax, fee. */
export function guessStage(categoryKey: string, name: string): string {
  const n = name.toLowerCase();
  if (categoryKey === "consultations" || /consult/.test(n)) return "consult";
  if (["color", "lightening", "texture"].includes(categoryKey)) return "chemical";
  if (categoryKey === "treatments" || /treatment|olaplex|conditioning|keratin/.test(n)) return "treatment";
  if (/wax|brow|lip/.test(n)) return "wax";
  if (/style|blow|updo|braid|curl|extension/.test(n) || categoryKey === "extensions") return "style";
  return "cut";
}

/** Typical salon hours for a new salon: Tue–Sat. */
export const STARTER_HOURS: Record<string, [string, string] | null> = { sun: null, mon: null, tue: ["09:00", "17:00"], wed: ["09:00", "17:00"], thu: ["09:00", "19:00"], fri: ["09:00", "17:00"], sat: ["09:00", "14:00"] };

const menu = menuJson as unknown as SeedMenu;
const cents = (d: number) => Math.round(d * 100);

export function businessRow(name: string, opts: { timezone?: string; hours?: Record<string, [string, string] | null> } = {}) {
  return {
    name,
    timezone: opts.timezone ?? menu.timezone,
    business_hours: opts.hours ?? stripNotes(menu.hours),
    policy_settings: stripNotes(policyJson),
    pricing_rules: stripNotes(pricingJson),
    payment_methods: stripNotes(paymentJson),
  };
}

export function categoryRows(businessId: string, source: SeedMenu = menu) {
  return source.categories.map((c, i) => ({ business_id: businessId, key: c.key, name: c.name, sort: i }));
}

export function serviceRows(businessId: string, categoryIds: Record<string, string>, source: SeedMenu = menu) {
  return source.categories.flatMap((c) =>
    c.services.map((s, i) => ({
      business_id: businessId,
      category_id: categoryIds[c.key],
      key: s.key,
      name: s.name,
      description: s.description ?? null,
      price_type: s.priceType,
      price_cents: cents(s.price),
      estimated_hours: s.estimatedHours ?? null,
      active_min: s.active,
      processing_min: s.processing,
      finish_min: s.finish,
      deposit_category: s.depositCategory,
      stage: s.stage ?? guessStage(c.key, s.name),
      includes: s.includes ?? [],
      bookable_online: s.bookableOnline ?? true,
      is_add_on: s.isAddOn ?? false,
      attaches_to: s.attachesTo ?? [],
      price_needs_review: s.priceNeedsReview ?? false,
      styleseat_price_cents: s.styleSeatPrice !== undefined ? cents(s.styleSeatPrice) : null,
      sort: i,
    })),
  );
}
