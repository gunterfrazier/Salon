import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { earnsCardReward, expiresOn, loyaltySettings, punchCard, referralCode, rewardLabel, type LoyaltySettings } from "./loyalty";

export interface Reward {
  id: string;
  kind: "loyalty" | "referral" | "welcome";
  label: string;
  discountKind: "percent" | "amount";
  value: number;
  expiresOn: string | null;
}

export async function loadLoyalty(db: SupabaseClient, businessId: string): Promise<LoyaltySettings> {
  const { data } = await db.from("businesses").select("loyalty").eq("id", businessId).single();
  return loyaltySettings(data?.loyalty);
}

/** Rewards a client can use now. */
export async function availableRewards(db: SupabaseClient, businessId: string, clientId: string, today: string): Promise<Reward[]> {
  const { data } = await db.from("client_rewards").select("id,kind,label,discount_kind,value,expires_on").eq("business_id", businessId).eq("client_id", clientId).is("redeemed_at", null).order("created_at");
  return (data ?? [])
    .filter((r) => !r.expires_on || r.expires_on >= today)
    .map((r) => ({ id: r.id, kind: r.kind, label: r.label, discountKind: r.discount_kind, value: r.value, expiresOn: r.expires_on }));
}

/** Paid visits that count toward the punch card. */
async function paidVisits(db: SupabaseClient, businessId: string, clientId: string): Promise<number> {
  const { data } = await db.from("appointments").select("id,appointment_services(price_quoted_cents)").eq("business_id", businessId).eq("client_id", clientId).eq("status", "completed");
  return ((data ?? []) as unknown as { appointment_services: { price_quoted_cents: number }[] }[]).filter((a) => a.appointment_services.reduce((n, l) => n + l.price_quoted_cents, 0) > 0).length;
}

/** Where a client is on the punch card (null when the card is off). */
export async function cardStatus(db: SupabaseClient, businessId: string, clientId: string, s?: LoyaltySettings): Promise<{ filled: number; toGo: number; visits: number; reward: string } | null> {
  const set = s ?? (await loadLoyalty(db, businessId));
  if (!set.card.enabled) return null;
  const done = await paidVisits(db, businessId, clientId);
  return { ...punchCard(done, set.card.visits), visits: set.card.visits, reward: rewardLabel(set.card.reward) };
}

/** After a visit is checked out: fill the punch card, and reward whoever referred a new client. Never throws. */
export async function afterCheckout(db: SupabaseClient, businessId: string, appointmentId: string, clientId: string, today: string): Promise<void> {
  try {
    const s = await loadLoyalty(db, businessId);
    const exp = expiresOn(today, s.expireMonths);
    const done = await paidVisits(db, businessId, clientId);
    if (s.card.enabled && earnsCardReward(done, s.card.visits)) {
      await db.from("client_rewards").upsert(
        { business_id: businessId, client_id: clientId, kind: "loyalty", label: `Loyalty reward: ${rewardLabel(s.card.reward)}`, discount_kind: s.card.reward.kind, value: s.card.reward.value, earned_appointment_id: appointmentId, expires_on: exp },
        { onConflict: "kind,earned_appointment_id", ignoreDuplicates: true },
      );
    }
    if (s.referral.enabled && done === 1) {
      const { data: c } = await db.from("clients").select("first_name,referred_by").eq("id", clientId).single();
      if (c?.referred_by) {
        await db.from("client_rewards").upsert(
          { business_id: businessId, client_id: c.referred_by, kind: "referral", label: `Thanks for referring ${c.first_name}: ${rewardLabel(s.referral.referrer)}`, discount_kind: s.referral.referrer.kind, value: s.referral.referrer.value, other_client_id: clientId, earned_appointment_id: appointmentId, expires_on: exp },
          { onConflict: "kind,earned_appointment_id", ignoreDuplicates: true },
        );
      }
    }
  } catch (e) {
    console.error(`[rewards] after checkout ${appointmentId}: ${(e as Error).message}`);
  }
}

/** A new client booked from a friend's link: remember who referred them and give the welcome reward. */
export async function welcomeReferral(db: SupabaseClient, businessId: string, newClientId: string, code: string, today: string): Promise<string | null> {
  const s = await loadLoyalty(db, businessId);
  if (!s.referral.enabled || !/^[A-Z0-9]{4,16}$/.test(code)) return null;
  const { data: ref } = await db.from("clients").select("id,first_name").eq("business_id", businessId).eq("referral_code", code).maybeSingle();
  if (!ref || ref.id === newClientId) return null;
  const { data: me } = await db.from("clients").select("referred_by").eq("id", newClientId).single();
  if (me?.referred_by) return null;
  await db.from("clients").update({ referred_by: ref.id }).eq("id", newClientId);
  await db.from("client_rewards").insert({ business_id: businessId, client_id: newClientId, kind: "welcome", label: `Welcome from ${ref.first_name}: ${rewardLabel(s.referral.friend)}`, discount_kind: s.referral.friend.kind, value: s.referral.friend.value, other_client_id: ref.id, expires_on: expiresOn(today, s.expireMonths) });
  return ref.first_name as string;
}

/** The client's own referral code, made on first use. */
export async function ensureReferralCode(db: SupabaseClient, businessId: string, clientId: string): Promise<string | null> {
  const { data: c } = await db.from("clients").select("first_name,referral_code").eq("id", clientId).eq("business_id", businessId).maybeSingle();
  if (!c) return null;
  if (c.referral_code) return c.referral_code as string;
  for (let i = 0; i < 5; i++) {
    const code = referralCode(c.first_name ?? "");
    const { error } = await db.from("clients").update({ referral_code: code }).eq("id", clientId).is("referral_code", null);
    if (!error) return code;
  }
  return null;
}
