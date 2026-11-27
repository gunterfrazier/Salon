import { notFound } from "next/navigation";
import ScreenPlayer from "@/components/screens/ScreenPlayer";
import { resolveScreen } from "@/lib/screens/resolve";
import { playerSettings } from "@/lib/screens/slides";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Screen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A public screen opened from its private link, with no sign-in. Only public
 * slides are ever loaded or shown here.
 */
export default async function PublicScreen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const db = createAdminClient();
  const { data: s } = await db.from("screens").select("id,business_id,audience").eq("token", token).maybeSingle();
  if (!s || s.audience !== "public") notFound();
  const { data: b } = await db.from("businesses").select("status").eq("id", s.business_id).single();
  if (!b || b.status !== "approved") notFound();
  const r = await resolveScreen(db, s.business_id, s.id);
  if (!r) notFound();
  return <ScreenPlayer name={r.name} slides={r.slides} settings={{ ...playerSettings(r.settings), touch: false }} data={r.data} sync={{ screenId: r.screenId, rev: r.rev, control: r.control, serverNow: r.serverNow }} />;
}
