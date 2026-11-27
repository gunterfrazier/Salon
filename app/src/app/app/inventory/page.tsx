import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { loadProducts } from "@/lib/data/inventory";
import InventoryView from "./InventoryView";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const ctx = await requirePermission("inventory.view");
  const products = await loadProducts(ctx.supabase, ctx.business.id);
  return (
    <>
      <AppNav current="/app/inventory" businessName={ctx.business.name} />
      <InventoryView products={products} can={{ manage: ctx.can("inventory.manage"), count: ctx.can("inventory.count"), order: ctx.can("inventory.order") }} />
    </>
  );
}
