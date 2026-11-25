import menuJson from "../../../../seed/service-menu.json";
import paymentJson from "../../../../seed/payment-methods.json";
import policyJson from "../../../../seed/policies.json";
import pricingJson from "../../../../seed/pricing-rules.json";

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
  active: number; processing: number; finish: number; depositCategory: string; stage: string; includes?: string[];
  isAddOn?: boolean; bookableOnline?: boolean; priceNeedsReview?: boolean; styleSeatPrice?: number; attachesTo?: string[];
};
type SeedMenu = { timezone: string; hours: Record<string, [string, string] | null | string>; categories: { key: string; name: string; services: SeedService[] }[] };

const menu = menuJson as unknown as SeedMenu;
const cents = (d: number) => Math.round(d * 100);

export function businessRow(name: string) {
  return {
    name,
    timezone: menu.timezone,
    business_hours: stripNotes(menu.hours),
    policy_settings: stripNotes(policyJson),
    pricing_rules: stripNotes(pricingJson),
    payment_methods: stripNotes(paymentJson),
  };
}

export function categoryRows(businessId: string) {
  return menu.categories.map((c, i) => ({ business_id: businessId, key: c.key, name: c.name, sort: i }));
}

export function serviceRows(businessId: string, categoryIds: Record<string, string>) {
  return menu.categories.flatMap((c) =>
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
      stage: s.stage,
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
