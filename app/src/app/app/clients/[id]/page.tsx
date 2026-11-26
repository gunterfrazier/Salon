import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { loadClientProfile } from "@/lib/data/client-profile";
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
  const [{ data: forms }, { data: templates }] = await Promise.all([
    ctx.supabase.from("client_forms").select("id,token,title,status,created_at,completed_at,fields,answers,signature").eq("business_id", ctx.business.id).eq("client_id", id).order("created_at", { ascending: false }).limit(100),
    ctx.supabase.from("form_templates").select("id,name").eq("business_id", ctx.business.id).order("sort"),
  ]);
  const items: ClientFormItem[] = (forms ?? []).map((f) => ({ id: f.id, token: f.token, title: f.title, status: f.status, createdAt: f.created_at, completedAt: f.completed_at, fields: f.fields, answers: f.answers, signature: f.signature }));
  return (
    <>
      <AppNav current="/app/clients" businessName={ctx.business.name} />
      <ClientProfile data={data} formsSlot={<ClientForms clientId={id} forms={items} templates={templates ?? []} canEdit={ctx.can("clients.edit")} tz={ctx.business.timezone} />} />
    </>
  );
}
