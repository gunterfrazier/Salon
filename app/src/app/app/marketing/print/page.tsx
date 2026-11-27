import { requirePermission } from "@/lib/context";
import { mergeNotificationSettings } from "@/lib/notify/settings";
import PrintSheet from "./PrintSheet";

export const metadata = { title: "Print" };
export const dynamic = "force-dynamic";

export default async function PrintPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const ctx = await requirePermission("settings.salon");
  const { kind } = await searchParams;
  const { data: b } = await ctx.supabase.from("businesses").select("slug,social,phone,notification_settings").eq("id", ctx.business.id).single();
  const site = process.env.SITE_URL ?? "https://chairvana.app";
  const social = (b?.social ?? {}) as Record<string, string>;
  const handle = social.instagram ? `@${social.instagram.replace(/\/+$/, "").split("/").pop()}` : null;
  return (
    <PrintSheet
      kind={kind === "counter" || kind === "cards" ? kind : "cling"}
      salon={ctx.business.name}
      bookUrl={`${site}/s/${b?.slug}/book`}
      pageUrl={`${site}/s/${b?.slug}`}
      reviewUrl={mergeNotificationSettings(b?.notification_settings).client.reviewRequest.url || `${site}/s/${b?.slug}#reviews`}
      phone={b?.phone ?? null}
      handle={handle}
    />
  );
}
