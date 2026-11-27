"use server";

import { cleanReview, statusFor } from "@/lib/reviews/summary";
import { notifyStaff } from "@/lib/notify/events";
import { mergeNotificationSettings } from "@/lib/notify/settings";
import { createAdminClient } from "@/lib/supabase/admin";

/** A client rates their visit from the review link. */
export async function submitReview(token: string, rating: unknown, body: unknown, share: boolean): Promise<{ ok: true; published: boolean; google: string | null } | { ok: false; error: string }> {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "This link isn't valid." };
  const c = cleanReview(rating, body);
  if (!c.ok) return c;
  const db = createAdminClient();
  const { data: r } = await db.from("reviews").select("id,business_id,staff_id,status,display_name,services").eq("token", token).maybeSingle();
  if (!r) return { ok: false, error: "This link isn't valid." };
  if (r.status !== "requested") return { ok: false, error: "You've already rated this visit. Thank you!" };
  const status = statusFor(c.rating, !!share);
  const { data: done } = await db.from("reviews").update({ rating: c.rating, body: c.body, status, submitted_at: new Date().toISOString() }).eq("id", r.id).eq("status", "requested").select("id");
  if (!done?.length) return { ok: false, error: "You've already rated this visit. Thank you!" };
  const { data: b } = await db.from("businesses").select("notification_settings").eq("id", r.business_id).single();
  const google = mergeNotificationSettings(b?.notification_settings).client.reviewRequest.url?.trim() || null;
  // Let the stylist know, especially about unhappy visits.
  const stars = "★".repeat(c.rating) + "☆".repeat(5 - c.rating);
  await notifyStaff(r.business_id, r.staff_id, "stylistReview", `${stars} from ${r.display_name ?? "a client"}${r.services ? ` (${r.services})` : ""}${c.body ? `: “${c.body.slice(0, 140)}”` : ""}${status === "private" ? " · private feedback" : ""}`, `review-in:${r.id}`, () => true);
  return { ok: true, published: status === "published", google: c.rating >= 4 && google && /^https:\/\//.test(google) ? google : null };
}
