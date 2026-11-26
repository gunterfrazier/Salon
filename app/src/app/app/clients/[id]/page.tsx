import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { loadClientProfile } from "@/lib/data/client-profile";
import ClientProfile from "./ClientProfile";

export const metadata = { title: "Client" };
export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getContext();
  const data = await loadClientProfile(ctx, id);
  if (!data) notFound();
  return (
    <>
      <AppNav current="/app/clients" businessName={ctx.business.name} />
      <ClientProfile data={data} />
    </>
  );
}
