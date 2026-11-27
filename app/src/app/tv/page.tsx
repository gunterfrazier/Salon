import ScreenPlayer from "@/components/screens/ScreenPlayer";
import { loadScreenData } from "@/lib/screens/data";
import { pairedDevice } from "@/lib/screens/device";
import { cleanPlaylist, cleanSettings, liveSlides, playerSettings } from "@/lib/screens/slides";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/time/zone";
import { tvClientCard, tvClientSearch, unpairThisTv } from "./actions";
import PairTv from "./PairTv";

export const metadata = { title: "Chairvana screen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * chairvana.app/tv on a TV: shows a pairing code until someone enters it in the
 * app, then plays the screen it was paired to, from then on.
 */
export default async function TvPage() {
  const d = await pairedDevice();
  if (!d) return <PairTv />;
  const db = createAdminClient();
  const [{ data: s }, { data: b }] = await Promise.all([
    db.from("screens").select("name,audience,playlist,settings").eq("id", d.screenId).maybeSingle(),
    db.from("businesses").select("status,timezone").eq("id", d.businessId).single(),
  ]);
  if (!s || !b || b.status !== "approved") return <PairTv />;
  const audience = s.audience === "staff" ? "staff" : "public";
  const settings = cleanSettings(s.settings);
  const slides = liveSlides(cleanPlaylist(s.playlist, audience), todayIn(b.timezone));
  const data = await loadScreenData(db, d.businessId, slides, audience);
  const lookup = audience === "staff" && slides.some((x) => x.type === "clientcard") ? { search: tvClientSearch, card: tvClientCard } : undefined;
  return <ScreenPlayer name={s.name} slides={slides} settings={playerSettings(settings)} data={data} clientCard={lookup} device={{ hasPin: !!settings.exitPin, unpair: unpairThisTv }} />;
}
