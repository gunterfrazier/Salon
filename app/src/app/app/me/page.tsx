import { redirect } from "next/navigation";
import { whoAmI } from "@/lib/auth/whoami";
import { loadCustomerHome } from "@/lib/data/customer";
import { loadPortal } from "@/lib/data/portal";
import { loadWaitlist } from "@/lib/data/waitlist";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeWindow } from "@/lib/waitlist/match";
import { availableRewards, cardStatus, ensureReferralCode, loadLoyalty } from "@/lib/promo/rewards";
import { rewardLabel } from "@/lib/promo/loyalty";
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
  const pk = await Promise.all(who.links.map(async (l) => (await db.from("client_packages").select("id,name,visits_total,visits_used,expires_on,status").eq("business_id", l.businessId).eq("client_id", l.clientId).eq("status", "active")).data?.map((p) => ({ ...p, salon: good.find((d) => d.salon.id === l.businessId)?.salon.name ?? "" })) ?? []));
  const today = new Date().toISOString().slice(0, 10);
  const packages = pk.flat().filter((p) => p.visits_used < p.visits_total && (!p.expires_on || p.expires_on >= today)).map((p) => ({ id: p.id, text: `${p.name}: ${p.visits_total - p.visits_used} of ${p.visits_total} visits left${p.expires_on ? ` (use by ${p.expires_on})` : ""}`, salon: p.salon }));
  // Loyalty card, rewards and referral link for each salon that has them on.
  const site = process.env.SITE_URL ?? "https://chairvana.app";
  const perks = (
    await Promise.all(
      who.links.map(async (l) => {
        const d = good.find((x) => x.salon.id === l.businessId);
        if (!d) return null;
        const set = await loadLoyalty(db, l.businessId);
        if (!set.card.enabled && !set.referral.enabled) return null;
        const t = new Date().toISOString().slice(0, 10);
        const [card, rewards, code] = await Promise.all([cardStatus(db, l.businessId, l.clientId, set), availableRewards(db, l.businessId, l.clientId, t), set.referral.enabled ? ensureReferralCode(db, l.businessId, l.clientId) : Promise.resolve(null)]);
        return { salon: d.salon.name, card, rewards: rewards.map((r) => ({ id: r.id, label: r.label, until: r.expiresOn })), refLink: code ? `${site}/s/${d.salon.slug}/book?ref=${code}` : null, friend: rewardLabel(set.referral.friend), you: rewardLabel(set.referral.referrer) };
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => !!x);
  return <MeView me={me as NonNullable<typeof me>} salons={good} waiting={waiting} packages={packages} perks={perks} />;
}
