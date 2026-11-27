import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { mediaUrl } from "@/lib/media";
import { cleanPlaylist, cleanSettings } from "@/lib/screens/slides";
import ScreensView from "./ScreensView";

export const metadata = { title: "Screens" };
export const dynamic = "force-dynamic";

export default async function ScreensPage() {
  const ctx = await requirePermission("settings.salon");
  const [{ data: screens }, { data: media }] = await Promise.all([
    ctx.supabase.from("screens").select("id,name,audience,token,playlist,settings").eq("business_id", ctx.business.id).order("sort").order("created_at"),
    ctx.supabase.from("signage_media").select("id,path,title,source,created_at").eq("business_id", ctx.business.id).order("created_at", { ascending: false }).limit(200),
  ]);
  const site = process.env.SITE_URL ?? "https://chairvana.app";
  return (
    <>
      <AppNav current="/app/screens" businessName={ctx.business.name} />
      <ScreensView
        screens={(screens ?? []).map((s) => {
          const audience = s.audience === "staff" ? ("staff" as const) : ("public" as const);
          return { id: s.id, name: s.name, audience, link: audience === "public" ? `${site}/tv/${s.token}` : null, slides: cleanPlaylist(s.playlist, audience).length, touch: cleanSettings(s.settings).touch };
        })}
        media={(media ?? []).map((m) => ({ id: m.id, url: mediaUrl(m.path)!, title: m.title, source: m.source as "upload" | "studio" | "brand" }))}
      />
    </>
  );
}
