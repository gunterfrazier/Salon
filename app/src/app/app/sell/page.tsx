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
  const [products, { data: clients }] = await Promise.all([
    loadProducts(ctx.supabase, ctx.business.id),
    ctx.supabase.from("clients").select("id,first_name,last_name,phone").eq("business_id", ctx.business.id).order("first_name").limit(5000),
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
        methods={MANUAL_METHODS.filter((m) => m.key === "cash" || m.key === "other" || enabled.has(m.key))}
      />
    </>
  );
}
