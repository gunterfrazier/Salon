import { redirect } from "next/navigation";
import { whoAmI } from "@/lib/auth/whoami";
import { loadCustomerHome } from "@/lib/data/customer";
import { loadPortal } from "@/lib/data/portal";
import MeView from "./MeView";

export const metadata = { title: "My appointments" };
export const dynamic = "force-dynamic";

/** Customer home: all their salons in one place. */
export default async function MePage() {
  const who = await whoAmI();
  if (who.kind === "staff") redirect("/today");
  if (who.kind !== "customer") redirect("/login");
  const [me, ...salons] = await Promise.all([
    loadCustomerHome(who.customerId, who.links.map((l) => l.businessId)),
    ...who.links.map((l) => loadPortal(l.clientId, l.businessId)),
  ]);
  if (!me) redirect("/login?error=noaccess");
  return <MeView me={me as NonNullable<typeof me>} salons={salons.filter((x): x is NonNullable<typeof x> => !!x && "salon" in x)} />;
}
