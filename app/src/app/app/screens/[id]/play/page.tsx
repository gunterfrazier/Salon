import { notFound } from "next/navigation";
import ScreenPlayer from "@/components/screens/ScreenPlayer";
import { requirePermission } from "@/lib/context";
import { loadScreenData } from "@/lib/screens/data";
import { cleanPlaylist, cleanSettings, liveSlides, playerSettings } from "@/lib/screens/slides";
import { todayIn } from "@/lib/time/zone";
import { screenClientCard, screenClientSearch } from "../../actions";

export const metadata = { title: "Screen" };
export const dynamic = "force-dynamic";

/** Any screen on a signed-in device. Staff screens may show client details. */
export default async function PlayScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePermission(["calendar.all", "booking.manage"]);
  const { data: s } = await ctx.supabase.from("screens").select("id,name,audience,playlist,settings").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!s) notFound();
  const audience = s.audience === "staff" ? "staff" : "public";
  const slides = liveSlides(cleanPlaylist(s.playlist, audience), todayIn(ctx.business.timezone));
  const data = await loadScreenData(ctx.supabase, ctx.business.id, slides, audience, { onlyStaffId: ctx.can("calendar.all") ? null : ctx.staff.id });
  const lookup = audience === "staff" && ctx.can("formulas") ? { search: screenClientSearch, card: screenClientCard } : undefined;
  return <ScreenPlayer name={s.name} slides={slides} settings={playerSettings(cleanSettings(s.settings))} data={data} clientCard={lookup} />;
}
