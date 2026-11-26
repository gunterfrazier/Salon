import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { MANUAL_METHODS } from "@/lib/data/calendar";
import { loadProducts } from "@/lib/data/inventory";
import { lineTitle } from "@/lib/inventory/stock";
import { mergeMethods } from "@/lib/payments/settings";
import SellView from "./SellView";

export const metadata = { title: "Sell" };
export const dynamic = "force-dynamic";

export default async function SellPage() {
  const ctx = await requirePermission("sell");
  const [products, { data: clients }, { data: tpls }] = await Promise.all([
    loadProducts(ctx.supabase, ctx.business.id),
    ctx.supabase.from("clients").select("id,first_name,last_name,phone").eq("business_id", ctx.business.id).order("first_name").limit(5000),
    ctx.supabase.from("package_templates").select("id,name,visits,price_cents,expire_months,services(name)").eq("business_id", ctx.business.id).eq("active", true).order("name"),
  ]);
  const enabled = new Set(mergeMethods(ctx.business.payment_methods).filter((m) => m.enabled).map((m) => m.key));
  return (
    <>
      <AppNav current="/app/sell" businessName={ctx.business.name} />
      <SellView
        products={products
          .filter((p) => p.kind === "retail" || p.kind === "care" || p.priceCents !== null)
          .map((p) => ({ id: p.id, label: `${lineTitle(p)} ${p.name}`, priceCents: p.priceCents, onHand: p.onHand, barcode: p.barcode, retail: p.kind === "retail" }))}
        clients={(clients ?? []).map((c) => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" "), phone: c.phone }))}
        templates={(tpls ?? []).map((t) => ({ id: t.id, name: t.name, visits: t.visits, priceCents: t.price_cents, expireMonths: t.expire_months, serviceName: (t.services as unknown as { name: string } | null)?.name ?? "service" }))}
        methods={MANUAL_METHODS.filter((m) => m.key === "cash" || m.key === "other" || enabled.has(m.key))}
      />
    </>
  );
}
