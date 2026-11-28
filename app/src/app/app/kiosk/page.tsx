import { requirePermission } from "@/lib/context";
import Kiosk from "./Kiosk";
import { cleanWalkinSettings } from "@/lib/walkins/engine";

export const metadata = { title: "Check in" };
export const dynamic = "force-dynamic";

/** Self check-in for a tablet at the door. Sign in on the tablet once, then open this page. */
export default async function KioskPage() {
  const ctx = await requirePermission("booking.manage");
  const { data } = await ctx.supabase.from("businesses").select("walkin_settings").eq("id", ctx.business.id).single();
  return <Kiosk salon={ctx.business.name} walkins={cleanWalkinSettings(data?.walkin_settings).mode !== "off"} />;
}
