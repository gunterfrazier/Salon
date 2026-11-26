import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import ImportClients from "./ImportClients";

export const metadata = { title: "Import clients" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ctx = await requirePermission("clients.edit");
  const { data } = await ctx.supabase.from("clients").select("phone,email").eq("business_id", ctx.business.id).limit(10000);
  return (
    <>
      <AppNav current="/clients" businessName={ctx.business.name} />
      <ImportClients existing={data ?? []} />
    </>
  );
}
