import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { mergeNotificationSettings } from "@/lib/notify/settings";
import MarketingView from "./MarketingView";
import { PROMO_COLS, toPromo } from "@/lib/promo/server";
import { loyaltySettings } from "@/lib/promo/loyalty";

export const metadata = { title: "Marketing" };
export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const ctx = await requirePermission("settings.salon");
  const { data: b } = await ctx.supabase.from("businesses").select("slug,social,notification_settings,loyalty").eq("id", ctx.business.id).single();
  const site = process.env.SITE_URL ?? "https://chairvana.app";
  const [{ data: promos }, { data: uses }, { data: services }] = await Promise.all([
    ctx.supabase.from("promo_codes").select(PROMO_COLS).eq("business_id", ctx.business.id).order("created_at", { ascending: false }),
    ctx.supabase.from("promo_redemptions").select("promo_id,discount_cents,appointments(status)").eq("business_id", ctx.business.id),
    ctx.supabase.from("services").select("id,name").eq("business_id", ctx.business.id).eq("archived", false).order("name"),
  ]);
  const live = (uses ?? []).filter((u) => (u.appointments as unknown as { status: string } | null)?.status !== "cancelled");
  return (
    <>
      <AppNav current="/app/marketing" businessName={ctx.business.name} />
      <MarketingView
        salon={ctx.business.name}
        pageUrl={`${site}/s/${b?.slug}`}
        shortUrl={`${site}/${b?.slug}`}
        bookUrl={`${site}/s/${b?.slug}/book`}
        googleReview={mergeNotificationSettings(b?.notification_settings).client.reviewRequest.url || null}
        social={(b?.social ?? {}) as Record<string, string>}
        promos={(promos ?? []).map((r) => ({ ...toPromo(r as Parameters<typeof toPromo>[0]), uses: live.filter((u) => u.promo_id === r.id).length, saved: live.filter((u) => u.promo_id === r.id).reduce((n, u) => n + u.discount_cents, 0) }))}
        services={services ?? []}
        loyalty={loyaltySettings(b?.loyalty)}
      />
    </>
  );
}
