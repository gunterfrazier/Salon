import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { loadProducts } from "@/lib/data/inventory";
import InventoryView from "./InventoryView";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const ctx = await getContext();
  const products = await loadProducts(ctx.supabase, ctx.business.id);
  return (
    <>
      <AppNav current="/inventory" businessName={ctx.business.name} />
      <InventoryView products={products} />
    </>
  );
}
