"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";

const METHODS = new Set(["cash", "venmo_direct", "cash_app_direct", "zelle", "paypal_me", "apple_cash", "other"]);

export interface SaleRequest {
  clientId: string | null;
  items: { productId: string; qty: number; priceCents: number }[];
  method: string;
  reference?: string;
}

/** Retail sale without an appointment, paid in full. */
export async function quickSale(req: SaleRequest): Promise<{ ok: true; saleId: string } | { ok: false; error: string }> {
  if (!METHODS.has(req.method)) return { ok: false, error: "Pick how they paid." };
  const items = req.items.filter((i) => i.qty > 0);
  if (!items.length) return { ok: false, error: "Add at least one product." };
  if (items.some((i) => !/^[0-9a-f-]{36}$/.test(i.productId) || !Number.isFinite(i.qty) || i.qty > 100 || !Number.isInteger(i.priceCents) || i.priceCents < 0 || i.priceCents > 1_000_000)) {
    return { ok: false, error: "Check each product's quantity and price." };
  }
  if (req.clientId && !/^[0-9a-f-]{36}$/.test(req.clientId)) return { ok: false, error: "Pick the client again." };
  const ctx = await getContext();
  const no = denied(ctx, "sell");
  if (no) return no;
  const { data, error } = await ctx.supabase.rpc("quick_sale", {
    p: {
      business_id: ctx.business.id,
      client_id: req.clientId,
      items: items.map((i) => ({ product_id: i.productId, qty: i.qty, price_cents: i.priceCents })),
      payment: { method: req.method, reference: (req.reference ?? "").trim().slice(0, 120) },
    },
  });
  if (error) return { ok: false, error: error.code === "P0002" ? "A product is no longer in inventory. Refresh and try again." : error.message };
  revalidatePath("/app/inventory");
  revalidatePath("/app/reports");
  return { ok: true, saleId: data as string };
}
