"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";

const METHODS = new Set(["cash", "venmo_direct", "cash_app_direct", "zelle", "paypal_me", "apple_cash", "other"]);

export interface SaleRequest {
  clientId: string | null;
  items: { productId: string; qty: number; priceCents: number }[];
  method: string;
  reference?: string;
  /** Part of the sale paid from a gift card. */
  gift?: { cardId: string; cents: number } | null;
}

/** Retail sale without an appointment, paid in full. */
export async function quickSale(req: SaleRequest): Promise<{ ok: true; saleId: string } | { ok: false; error: string }> {
  const total = req.items.reduce((n, i) => n + Math.round(i.qty * i.priceCents), 0);
  const giftCents = req.gift?.cents ?? 0;
  if (!Number.isInteger(giftCents) || giftCents < 0 || giftCents > total) return { ok: false, error: "Check the gift card amount." };
  if (giftCents < total && !METHODS.has(req.method)) return { ok: false, error: "Pick how they paid." };
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
      payment: { method: METHODS.has(req.method) ? req.method : "other", reference: (req.reference ?? "").trim().slice(0, 120) },
      gift: giftCents > 0 ? { card_id: req.gift!.cardId, amount_cents: giftCents } : null,
    },
  });
  if (error) return { ok: false, error: error.code === "P0002" ? (/Gift card/.test(error.message) ? "Gift card not found." : "A product is no longer in inventory. Refresh and try again.") : error.message };
  revalidatePath("/app/inventory");
  revalidatePath("/app/reports");
  return { ok: true, saleId: data as string };
}

export interface GiftCardSale {
  amountCents: number;
  recipientName: string;
  message: string;
  clientId: string | null;
  method: string;
  reference?: string;
}

/** Sell a gift card; returns its code. */
export async function sellGiftCard(req: GiftCardSale): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
  if (!METHODS.has(req.method)) return { ok: false, error: "Pick how they paid." };
  if (!Number.isInteger(req.amountCents) || req.amountCents < 100 || req.amountCents > 100000) return { ok: false, error: "Enter an amount from $1 to $1,000." };
  if (req.clientId && !/^[0-9a-f-]{36}$/.test(req.clientId)) return { ok: false, error: "Pick the client again." };
  const ctx = await getContext();
  const no = denied(ctx, "sell");
  if (no) return no;
  const { data, error } = await ctx.supabase.rpc("sell_gift_card", {
    p: { business_id: ctx.business.id, client_id: req.clientId, amount_cents: req.amountCents, recipient_name: (req.recipientName ?? "").trim().slice(0, 100), message: (req.message ?? "").trim().slice(0, 300), method: req.method, reference: (req.reference ?? "").trim().slice(0, 120) },
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/sell/gift-cards");
  revalidatePath("/app/reports");
  const r = data as { id: string; code: string };
  return { ok: true, id: r.id, code: r.code };
}

/** Sell a package of visits to a client. */
export async function sellPackage(req: { clientId: string; templateId: string; method: string; reference?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/.test(req.clientId ?? "")) return { ok: false, error: "Pick the client." };
  if (!/^[0-9a-f-]{36}$/.test(req.templateId ?? "")) return { ok: false, error: "Pick a package." };
  if (!METHODS.has(req.method)) return { ok: false, error: "Pick how they paid." };
  const ctx = await getContext();
  const no = denied(ctx, "sell");
  if (no) return no;
  const { error } = await ctx.supabase.rpc("sell_package", { p: { business_id: ctx.business.id, client_id: req.clientId, template_id: req.templateId, method: req.method, reference: (req.reference ?? "").trim().slice(0, 120) } });
  if (error) return { ok: false, error: error.code === "P0002" ? "That package isn't for sale anymore." : error.message };
  revalidatePath("/app/sell/gift-cards");
  revalidatePath(`/app/clients/${req.clientId}`);
  revalidatePath("/app/reports");
  return { ok: true };
}

/** Packages the salon sells: add or update. */
export async function savePackageTemplate(t: { id: string | null; name: string; serviceId: string; visits: number; priceCents: number; expireMonths: number | null; active: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.services");
  if (no) return no;
  const name = (t.name ?? "").trim().slice(0, 100);
  if (!name) return { ok: false, error: "Name the package, e.g. “5 blowouts”." };
  if (!/^[0-9a-f-]{36}$/.test(t.serviceId ?? "")) return { ok: false, error: "Pick the service." };
  if (!Number.isInteger(t.visits) || t.visits < 1 || t.visits > 100) return { ok: false, error: "Visits should be 1 to 100." };
  if (!Number.isInteger(t.priceCents) || t.priceCents < 0 || t.priceCents > 1_000_000) return { ok: false, error: "Check the price." };
  if (t.expireMonths !== null && !(Number.isInteger(t.expireMonths) && t.expireMonths >= 1 && t.expireMonths <= 60)) return { ok: false, error: "Expires after 1 to 60 months, or never." };
  const { data: svc } = await ctx.supabase.from("services").select("id").eq("id", t.serviceId).eq("business_id", ctx.business.id).maybeSingle();
  if (!svc) return { ok: false, error: "Pick the service." };
  const row = { name, service_id: t.serviceId, visits: t.visits, price_cents: t.priceCents, expire_months: t.expireMonths, active: !!t.active };
  const { error } = t.id
    ? await ctx.supabase.from("package_templates").update(row).eq("id", t.id).eq("business_id", ctx.business.id)
    : await ctx.supabase.from("package_templates").insert({ ...row, business_id: ctx.business.id });
  if (error) return { ok: false, error: "Couldn't save the package." };
  revalidatePath("/app/sell/gift-cards");
  revalidatePath("/app/sell");
  return { ok: true };
}

/** Cancel a gift card (e.g. sold by mistake or refunded). Its remaining balance can't be used. */
export async function voidGiftCard(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.payments");
  if (no) return no;
  const { data: g } = await ctx.supabase.from("gift_cards").select("id,balance_cents,status").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!g || g.status !== "active") return { ok: false, error: "Gift card not found." };
  const { error } = await ctx.supabase.from("gift_cards").update({ status: "void", balance_cents: 0 }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't cancel it." };
  await ctx.supabase.from("gift_card_moves").insert({ business_id: ctx.business.id, card_id: id, change_cents: -g.balance_cents, kind: "void", note: "Cancelled" });
  revalidatePath("/app/sell/gift-cards");
  return { ok: true };
}
