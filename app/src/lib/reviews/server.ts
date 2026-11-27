import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName, summarize, type ReviewSummary } from "./summary";

/** The review link for a finished visit (one per appointment). */
export async function reviewTokenFor(db: SupabaseClient, a: { id: string; business_id: string; client_id: string; staff_id: string | null }, services: string[]): Promise<string | null> {
  const { data: existing } = await db.from("reviews").select("token").eq("appointment_id", a.id).maybeSingle();
  if (existing) return existing.token as string;
  const { data: c } = await db.from("clients").select("first_name,last_name").eq("id", a.client_id).maybeSingle();
  const { data, error } = await db
    .from("reviews")
    .insert({ business_id: a.business_id, client_id: a.client_id, appointment_id: a.id, staff_id: a.staff_id, services: services.join(", ").slice(0, 300), display_name: displayName(c?.first_name, c?.last_name) })
    .select("token")
    .single();
  return error ? null : (data.token as string);
}

export interface PublicReview {
  id: string;
  rating: number;
  body: string | null;
  name: string;
  services: string | null;
  staff: string | null;
  at: string;
  reply: string | null;
}

/** Published reviews for a salon page, with the summary. */
export async function loadPublicReviews(db: SupabaseClient, businessId: string, limit = 30): Promise<{ summary: ReviewSummary; list: PublicReview[] }> {
  const { data: all } = await db.from("reviews").select("rating").eq("business_id", businessId).eq("status", "published");
  const { data } = await db
    .from("reviews")
    .select("id,rating,body,display_name,services,submitted_at,reply,staff(display_name)")
    .eq("business_id", businessId)
    .eq("status", "published")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  return {
    summary: summarize((all ?? []).map((r) => r.rating as number)),
    list: (data ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      name: r.display_name ?? "A client",
      services: r.services,
      staff: (r.staff as unknown as { display_name: string } | null)?.display_name?.split(" ")[0] ?? null,
      at: r.submitted_at,
      reply: r.reply,
    })),
  };
}
