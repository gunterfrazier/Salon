import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { mediaUrl } from "@/lib/media";
import { cleanPlaylist, cleanSettings } from "@/lib/screens/slides";
import ScreensView from "./ScreensView";

export const metadata = { title: "Screens" };
export const dynamic = "force-dynamic";

export default async function ScreensPage() {
  const ctx = await requirePermission("settings.salon");
  const [{ data: screens }, { data: media }, { data: devices }] = await Promise.all([
    ctx.supabase.from("screens").select("id,name,audience,token,playlist,settings").eq("business_id", ctx.business.id).order("sort").order("created_at"),
    ctx.supabase.from("signage_media").select("id,path,title,source,created_at").eq("business_id", ctx.business.id).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.from("screen_devices").select("screen_id,last_seen").eq("business_id", ctx.business.id),
  ]);
  const checkedAt = new Date().getTime();
  const tvs = (id: string) => {
    const mine = (devices ?? []).filter((d) => d.screen_id === id);
    return { total: mine.length, on: mine.filter((d) => d.last_seen && checkedAt - Date.parse(d.last_seen) < 5 * 60_000).length };
  };
  const site = process.env.SITE_URL ?? "https://chairvana.app";
  return (
    <>
      <AppNav current="/app/screens" businessName={ctx.business.name} />
      <ScreensView
        screens={(screens ?? []).map((s) => {
          const audience = s.audience === "staff" ? ("staff" as const) : ("public" as const);
          return { id: s.id, name: s.name, audience, link: audience === "public" ? `${site}/tv/${s.token}` : null, slides: cleanPlaylist(s.playlist, audience).length, touch: cleanSettings(s.settings).touch, tvs: tvs(s.id) };
        })}
        media={(media ?? []).map((m) => ({ id: m.id, url: mediaUrl(m.path)!, title: m.title, source: m.source as "upload" | "studio" | "brand" }))}
      />
    </>
  );
}
