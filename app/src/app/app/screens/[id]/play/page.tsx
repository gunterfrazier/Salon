import { notFound } from "next/navigation";
import ScreenPlayer from "@/components/screens/ScreenPlayer";
import { requirePermission } from "@/lib/context";
import { resolveScreen } from "@/lib/screens/resolve";
import { playerSettings } from "@/lib/screens/slides";
import { screenClientCard, screenClientSearch } from "../../actions";

export const metadata = { title: "Screen" };
export const dynamic = "force-dynamic";

/** Any screen on a signed-in device. Staff screens may show client details. */
export default async function PlayScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePermission(["calendar.all", "booking.manage"]);
  const r = await resolveScreen(ctx.supabase, ctx.business.id, id, { onlyStaffId: ctx.can("calendar.all") ? null : ctx.staff.id });
  if (!r) notFound();
  const lookup = r.audience === "staff" && ctx.can("formulas") ? { search: screenClientSearch, card: screenClientCard } : undefined;
  return <ScreenPlayer name={r.name} slides={r.slides} settings={playerSettings(r.settings)} data={r.data} clientCard={lookup} sync={{ screenId: r.screenId, rev: r.rev, control: r.control, serverNow: r.serverNow }} />;
}
