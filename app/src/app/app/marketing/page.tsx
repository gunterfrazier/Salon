import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { mergeNotificationSettings } from "@/lib/notify/settings";
import MarketingView from "./MarketingView";

export const metadata = { title: "Marketing" };
export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const ctx = await requirePermission("settings.salon");
  const { data: b } = await ctx.supabase.from("businesses").select("slug,social,notification_settings").eq("id", ctx.business.id).single();
  const site = process.env.SITE_URL ?? "https://chairvana.app";
  return (
    <>
      <AppNav current="/app/marketing" businessName={ctx.business.name} />
      <MarketingView
        salon={ctx.business.name}
        pageUrl={`${site}/s/${b?.slug}`}
        bookUrl={`${site}/s/${b?.slug}/book`}
        googleReview={mergeNotificationSettings(b?.notification_settings).client.reviewRequest.url || null}
        social={(b?.social ?? {}) as Record<string, string>}
      />
    </>
  );
}
