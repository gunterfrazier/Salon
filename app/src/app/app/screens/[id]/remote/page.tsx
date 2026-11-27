import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { resolvePlaylist } from "@/lib/screens/resolve";
import { SLIDES } from "@/lib/screens/slides";
import RemoteView from "./RemoteView";

export const metadata = { title: "Screen remote" };
export const dynamic = "force-dynamic";

/** Control a screen from a phone: next, back, pause, or play something else for a while. */
export default async function RemotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePermission(["settings.salon", "booking.manage"]);
  const [p, { data: screens }] = await Promise.all([
    resolvePlaylist(ctx.supabase, ctx.business.id, id),
    ctx.supabase.from("screens").select("id,name").eq("business_id", ctx.business.id).order("name"),
  ]);
  if (!p) notFound();
  return (
    <>
      <AppNav current="/app/front-desk" businessName={ctx.business.name} />
      <RemoteView
        id={p.screenId}
        name={p.name}
        source={p.source}
        slides={p.slides.map((s) => ({ id: s.id, label: s.type === "message" && s.title ? s.title : SLIDES[s.type].label, seconds: s.seconds }))}
        control={p.control}
        serverNow={p.serverNow}
        others={(screens ?? []).filter((s) => s.id !== p.screenId)}
        tz={ctx.business.timezone}
      />
    </>
  );
}
