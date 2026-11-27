"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";

type Result = { ok: true } | { ok: false; error: string };

export async function replyToReview(id: string, reply: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.messages");
  if (no) return no;
  const text = (reply ?? "").trim().slice(0, 1000);
  const { error } = await ctx.supabase.from("reviews").update({ reply: text || null, replied_at: text ? new Date().toISOString() : null }).eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't save the reply." };
  revalidatePath("/app/reviews");
  return { ok: true };
}

/** Hide a public review, or show it again (only reviews the client agreed to share). */
export async function setReviewVisible(id: string, visible: boolean): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.messages");
  if (no) return no;
  const { data: r } = await ctx.supabase.from("reviews").select("status,rating").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!r) return { ok: false, error: "Review not found." };
  if (visible && r.status !== "hidden") return { ok: false, error: "Only hidden reviews can be shown again." };
  if (!visible && r.status !== "published") return { ok: false, error: "This review isn't public." };
  const { error } = await ctx.supabase.from("reviews").update({ status: visible ? "published" : "hidden" }).eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: "Couldn't change it." };
  revalidatePath("/app/reviews");
  return { ok: true };
}
