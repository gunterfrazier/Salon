import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { loadClientProfile } from "@/lib/data/client-profile";
import { money } from "@/lib/format";
import { todayIn } from "@/lib/time/zone";
import ClientForms, { type ClientFormItem } from "./ClientForms";
import ClientProfile from "./ClientProfile";

export const metadata = { title: "Client" };
export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getContext();
  const data = await loadClientProfile(ctx, id);
  if (!data) notFound();
  const [{ data: forms }, { data: templates }, { data: pkgs }, { data: cards }] = await Promise.all([
    ctx.supabase.from("client_forms").select("id,token,title,status,created_at,completed_at,fields,answers,signature").eq("business_id", ctx.business.id).eq("client_id", id).order("created_at", { ascending: false }).limit(100),
    ctx.supabase.from("form_templates").select("id,name").eq("business_id", ctx.business.id).order("sort"),
    ctx.supabase.from("client_packages").select("id,name,visits_total,visits_used,expires_on,status").eq("business_id", ctx.business.id).eq("client_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("gift_cards").select("id,code,balance_cents,initial_cents,status").eq("business_id", ctx.business.id).eq("purchaser_client_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const today = todayIn(ctx.business.timezone);
  const prepaid =
    (pkgs?.length ?? 0) + (cards?.length ?? 0) > 0 ? (
      <section className="space-y-2 rounded-xl border border-line bg-surface p-4" aria-label="Packages and gift cards">
        <h2 className="font-semibold">Packages &amp; gift cards</h2>
        <ul className="divide-y divide-line text-sm">
          {(pkgs ?? []).map((p) => {
            const left = p.visits_total - p.visits_used;
            const expired = !!p.expires_on && p.expires_on < today;
            return (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="font-medium">{p.name}</span>
                <span className={left > 0 && !expired && p.status === "active" ? "" : "text-muted"}>
                  {p.status !== "active" ? "Cancelled" : expired ? "Expired" : `${left} of ${p.visits_total} visits left`}
                  {p.expires_on && !expired && p.status === "active" && left > 0 ? ` · until ${p.expires_on}` : ""}
                </span>
              </li>
            );
          })}
          {(cards ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>Gift card bought <span className="font-mono">{c.code.replace(/(.{4})/, "$1-")}</span></span>
              <span className="text-muted">{c.status === "void" ? "Cancelled" : `${money(c.balance_cents)} of ${money(c.initial_cents)} left`}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Package visits are used at checkout.</p>
      </section>
    ) : null;
  const items: ClientFormItem[] = (forms ?? []).map((f) => ({ id: f.id, token: f.token, title: f.title, status: f.status, createdAt: f.created_at, completedAt: f.completed_at, fields: f.fields, answers: f.answers, signature: f.signature }));
  return (
    <>
      <AppNav current="/app/clients" businessName={ctx.business.name} />
      <ClientProfile data={data} formsSlot={<>{prepaid}<ClientForms clientId={id} forms={items} templates={templates ?? []} canEdit={ctx.can("clients.edit")} tz={ctx.business.timezone} /></>} />
    </>
  );
}
