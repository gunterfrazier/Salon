import { requirePermission } from "@/lib/context";
import Kiosk from "./Kiosk";

export const metadata = { title: "Check in" };
export const dynamic = "force-dynamic";

/** Self check-in for a tablet at the door. Sign in on the tablet once, then open this page. */
export default async function KioskPage() {
  const ctx = await requirePermission("booking.manage");
  return <Kiosk salon={ctx.business.name} />;
}
