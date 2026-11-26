import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import PrepaidAdmin from "./PrepaidAdmin";

export const metadata = { title: "Gift cards & packages" };
export const dynamic = "force-dynamic";

export default async function GiftCardsPage() {
  const ctx = await requirePermission("sell");
  const db = ctx.supabase;
  const biz = ctx.business.id;
  const [{ data: cards }, { data: tpls }, { data: pkgs }, { data: services }] = await Promise.all([
    db.from("gift_cards").select("id,code,initial_cents,balance_cents,recipient_name,status,expires_on,created_at,clients(first_name,last_name)").eq("business_id", biz).order("created_at", { ascending: false }).limit(300),
    db.from("package_templates").select("id,name,service_id,visits,price_cents,expire_months,active").eq("business_id", biz).order("name"),
    db.from("client_packages").select("id,client_id,name,visits_total,visits_used,expires_on,status,created_at,clients(first_name,last_name)").eq("business_id", biz).order("created_at", { ascending: false }).limit(300),
    db.from("services").select("id,name").eq("business_id", biz).eq("archived", false).order("name"),
  ]);
  const who = (c: unknown) => {
    const x = c as { first_name: string; last_name: string | null } | null;
    return x ? [x.first_name, x.last_name].filter(Boolean).join(" ") : null;
  };
  return (
    <>
      <AppNav current="/app/sell" businessName={ctx.business.name} />
      <PrepaidAdmin
        cards={(cards ?? []).map((c) => ({ id: c.id, code: c.code, initialCents: c.initial_cents, balanceCents: c.balance_cents, recipient: c.recipient_name, buyer: who(c.clients), status: c.status, expiresOn: c.expires_on, createdAt: c.created_at }))}
        templates={(tpls ?? []).map((t) => ({ id: t.id, name: t.name, serviceId: t.service_id, visits: t.visits, priceCents: t.price_cents, expireMonths: t.expire_months, active: t.active }))}
        packages={(pkgs ?? []).map((p) => ({ id: p.id, clientId: p.client_id, client: who(p.clients) ?? "Client", name: p.name, used: p.visits_used, total: p.visits_total, expiresOn: p.expires_on, createdAt: p.created_at }))}
        services={services ?? []}
        can={{ templates: ctx.can("settings.services"), void: ctx.can("settings.payments") }}
        tz={ctx.business.timezone}
      />
    </>
  );
}
