import ScreenPlayer from "@/components/screens/ScreenPlayer";
import { pairedDevice } from "@/lib/screens/device";
import { resolveScreen } from "@/lib/screens/resolve";
import { playerSettings } from "@/lib/screens/slides";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const { data: b } = await db.from("businesses").select("status").eq("id", d.businessId).single();
  if (!b || b.status !== "approved") return <PairTv />;
  const r = await resolveScreen(db, d.businessId, d.screenId);
  if (!r) return <PairTv />;
  const lookup = r.audience === "staff" && r.slides.some((x) => x.type === "clientcard") ? { search: tvClientSearch, card: tvClientCard } : undefined;
  return (
    <ScreenPlayer
      name={r.name}
      slides={r.slides}
      settings={playerSettings(r.settings)}
      data={r.data}
      clientCard={lookup}
      device={{ hasPin: !!r.settings.exitPin, unpair: unpairThisTv }}
      sync={{ screenId: r.screenId, rev: r.rev, control: r.control, serverNow: r.serverNow }}
    />
  );
}
