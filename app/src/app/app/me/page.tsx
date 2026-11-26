import { redirect } from "next/navigation";
import { whoAmI } from "@/lib/auth/whoami";
import { loadCustomerHome } from "@/lib/data/customer";
import { loadPortal } from "@/lib/data/portal";
import { loadWaitlist } from "@/lib/data/waitlist";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeWindow } from "@/lib/waitlist/match";
import MeView from "./MeView";

export const metadata = { title: "My appointments" };
export const dynamic = "force-dynamic";

/** Customer home: all their salons in one place. */
export default async function MePage() {
  const who = await whoAmI();
  if (who.kind === "staff") redirect("/app/today");
  if (who.kind !== "customer") redirect("/app/login");
  const [me, ...salons] = await Promise.all([
    loadCustomerHome(who.customerId, who.links.map((l) => l.businessId)),
    ...who.links.map((l) => loadPortal(l.clientId, l.businessId)),
  ]);
  if (!me) redirect("/app/login?error=noaccess");
  const db = createAdminClient();
  const lists = await Promise.all(who.links.map(async (l) => (await loadWaitlist(db, l.businessId, { clientIds: [l.clientId] })).map((w) => ({ w, businessId: l.businessId }))));
  const good = salons.filter((x): x is NonNullable<typeof x> => !!x && "salon" in x);
  const waiting = lists
    .flat()
    .filter(({ w }) => w.status === "active")
    .map(({ w, businessId }) => ({ id: w.id, salon: good.find((d) => d.salon.id === businessId)?.salon.name ?? "", what: `${w.serviceNames.join(" + ")}${w.staffName ? ` with ${w.staffName}` : ""}`, window: describeWindow(w) }));
  return <MeView me={me as NonNullable<typeof me>} salons={good} waiting={waiting} />;
}
