import { redirect } from "next/navigation";
import { whoAmI } from "@/lib/auth/whoami";
import { loadPortal } from "@/lib/data/portal";
import MeView from "./MeView";

export const metadata = { title: "My appointments" };
export const dynamic = "force-dynamic";

/** Client portal home. */
export default async function MePage() {
  const who = await whoAmI();
  if (who.kind === "staff") redirect("/today");
  if (who.kind !== "client") redirect("/login");
  const data = await loadPortal(who.clientId, who.businessId);
  if (!data) redirect("/login?error=noaccess");
  return <MeView data={data} />;
}
