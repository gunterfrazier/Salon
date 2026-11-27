import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { mediaUrl } from "@/lib/media";
import { cleanPlaylist, cleanSettings } from "@/lib/screens/slides";
import { STAFF_COLS, toStylists, type StaffRow } from "@/lib/staff/stylists";
import ScreenEditor from "./ScreenEditor";

export const metadata = { title: "Edit screen" };
export const dynamic = "force-dynamic";

export default async function EditScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePermission("settings.salon");
  const [{ data: s }, { data: media }, { data: staff }] = await Promise.all([
    ctx.supabase.from("screens").select("id,name,audience,token,playlist,settings").eq("id", id).eq("business_id", ctx.business.id).maybeSingle(),
    ctx.supabase.from("signage_media").select("id,path,title").eq("business_id", ctx.business.id).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.from("staff").select(STAFF_COLS).eq("business_id", ctx.business.id),
  ]);
  if (!s) notFound();
  const audience = s.audience === "staff" ? ("staff" as const) : ("public" as const);
  const site = process.env.SITE_URL ?? "https://chairvana.app";
  return (
    <>
      <AppNav current="/app/screens" businessName={ctx.business.name} />
      <ScreenEditor
        screen={{ id: s.id, name: s.name, audience, playlist: cleanPlaylist(s.playlist, "staff"), settings: cleanSettings(s.settings), link: audience === "public" ? `${site}/tv/${s.token}` : null }}
        media={(media ?? []).map((m) => ({ id: m.id, url: mediaUrl(m.path)!, title: m.title }))}
        stylists={toStylists((staff ?? []) as StaffRow[]).map((x) => ({ id: x.id, name: x.name }))}
      />
    </>
  );
}
