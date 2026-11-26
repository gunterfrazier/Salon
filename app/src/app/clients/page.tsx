import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { loadClientList } from "@/lib/data/client-list";
import ClientsList from "./ClientsList";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const ctx = await getContext();
  const clients = await loadClientList(ctx);
  return (
    <>
      <AppNav current="/clients" businessName={ctx.business.name} />
      <ClientsList clients={clients} timezone={ctx.business.timezone} />
    </>
  );
}
