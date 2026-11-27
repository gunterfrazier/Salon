import { notFound } from "next/navigation";
import ScreenPlayer from "@/components/screens/ScreenPlayer";
import { loadScreenData } from "@/lib/screens/data";
import { cleanPlaylist, cleanSettings, liveSlides } from "@/lib/screens/slides";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/time/zone";

export const metadata = { title: "Screen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A public screen (front window, waiting area) opened from its private link,
 * with no sign-in. Only public slides are ever loaded or shown here.
 */
export default async function PublicScreen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const db = createAdminClient();
  const { data: s } = await db.from("screens").select("id,business_id,name,audience,playlist,settings").eq("token", token).maybeSingle();
  if (!s || s.audience !== "public") notFound();
  const { data: b } = await db.from("businesses").select("status,timezone").eq("id", s.business_id).single();
  if (!b || b.status !== "approved") notFound();
  const slides = liveSlides(cleanPlaylist(s.playlist, "public"), todayIn(b.timezone));
  const data = await loadScreenData(db, s.business_id, slides, "public");
  return <ScreenPlayer name={s.name} slides={slides} settings={{ ...cleanSettings(s.settings), touch: false }} data={data} />;
}
