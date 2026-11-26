import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** "abcd-2345 " → "ABCD2345" */
export const normalizeCode = (s: unknown) => (typeof s === "string" ? s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) : "");

export interface GiftCardInfo {
  id: string;
  code: string;
  balanceCents: number;
  initialCents: number;
  recipientName: string | null;
  expiresOn: string | null;
  usable: boolean;
  why: string | null;
}

export async function findGiftCard(db: SupabaseClient, businessId: string, code: string, today: string): Promise<GiftCardInfo | null> {
  const c = normalizeCode(code);
  if (c.length < 6) return null;
  const { data } = await db.from("gift_cards").select("id,code,balance_cents,initial_cents,recipient_name,expires_on,status").eq("business_id", businessId).eq("code", c).maybeSingle();
  if (!data) return null;
  const why = data.status !== "active" ? "This gift card was cancelled." : data.expires_on && data.expires_on < today ? "This gift card has expired." : data.balance_cents <= 0 ? "This gift card has no balance left." : null;
  return { id: data.id, code: data.code, balanceCents: data.balance_cents, initialCents: data.initial_cents, recipientName: data.recipient_name, expiresOn: data.expires_on, usable: !why, why };
}

export interface ClientPackageInfo {
  id: string;
  name: string;
  serviceId: string;
  left: number;
  total: number;
  expiresOn: string | null;
}

/** A client's packages with visits left that haven't expired. */
export async function usablePackages(db: SupabaseClient, businessId: string, clientId: string, today: string): Promise<ClientPackageInfo[]> {
  const { data } = await db.from("client_packages").select("id,name,service_id,visits_total,visits_used,expires_on,status").eq("business_id", businessId).eq("client_id", clientId).eq("status", "active").order("created_at");
  return (data ?? [])
    .filter((p) => p.visits_used < p.visits_total && (!p.expires_on || p.expires_on >= today))
    .map((p) => ({ id: p.id, name: p.name, serviceId: p.service_id, left: p.visits_total - p.visits_used, total: p.visits_total, expiresOn: p.expires_on }));
}
