import { notFound } from "next/navigation";
import InventoryView from "@/app/app/inventory/InventoryView";
import type { Product } from "@/lib/inventory/stock";

/** Development-only preview of Inventory with sample products (404 in production). */
export const dynamic = "force-dynamic";

const base: Product = { id: "", kind: "color", brand: "Redken", line: "Shades EQ Gloss", shade: null, name: "", size: 2, unit: "oz", barcode: null, saloncentricItem: null, cosmoprofItem: null, vendor: "saloncentric", costCents: 1150, priceCents: null, onHand: 2, minQty: 1, maxQty: 3, archived: false };
const P = (id: string, name: string, x: Partial<Product> = {}): Product => ({ ...base, id, shade: id, name, ...x });

export default function DevInventory() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <InventoryView
      products={[
        P("09V", "09V Platinum Ice", { onHand: 0.5, saloncentricItem: "RK-P1234" }),
        P("010N", "010N Delicate Natural", { onHand: 3 }),
        P("07NB", "07NB Chestnut", { onHand: 0 }),
        P("6N", "6N", { brand: "Kenra Professional", line: "Kenra Color Permanent", size: 3, vendor: "cosmoprof", cosmoprofItem: "CP-55021", costCents: 1095, onHand: 1, minQty: 2, maxQty: 4 }),
        P("7NB", "7NB", { brand: "Kenra Professional", line: "Kenra Color Permanent", size: 3, vendor: "cosmoprof", onHand: 2.25, minQty: 1, maxQty: 3 }),
        P("dev20", "20 Volume", { kind: "developer", brand: "Kenra Professional", line: "Developer", shade: null, size: 32, onHand: 1, minQty: null, maxQty: null, vendor: null }),
      ]}
    />
  );
}
