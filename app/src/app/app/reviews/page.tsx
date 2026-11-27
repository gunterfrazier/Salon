import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { summarize } from "@/lib/reviews/summary";
import ReviewsView from "./ReviewsView";

export const metadata = { title: "Reviews" };
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const ctx = await requirePermission("settings.messages");
  const { data } = await ctx.supabase
    .from("reviews")
    .select("id,client_id,rating,body,display_name,services,status,reply,submitted_at,staff(display_name)")
    .eq("business_id", ctx.business.id)
    .neq("status", "requested")
    .order("submitted_at", { ascending: false })
    .limit(300);
  const { count: waiting } = await ctx.supabase.from("reviews").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).eq("status", "requested");
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    clientId: r.client_id as string | null,
    rating: r.rating as number,
    body: r.body as string | null,
    name: (r.display_name as string | null) ?? "A client",
    services: r.services as string | null,
    status: r.status as "published" | "private" | "hidden",
    reply: r.reply as string | null,
    at: r.submitted_at as string,
    staff: (r.staff as unknown as { display_name: string } | null)?.display_name ?? null,
  }));
  const { data: biz } = await ctx.supabase.from("businesses").select("slug").eq("id", ctx.business.id).single();
  return (
    <>
      <AppNav current="/app/reviews" businessName={ctx.business.name} />
      <ReviewsView rows={rows} summary={summarize(rows.filter((r) => r.status === "published").map((r) => r.rating))} waiting={waiting ?? 0} slug={biz?.slug ?? null} tz={ctx.business.timezone} />
    </>
  );
}
