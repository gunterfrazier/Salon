import { whoAmI } from "@/lib/auth/whoami";
import { createAdminClient } from "@/lib/supabase/admin";
import FindView from "./FindView";

export const metadata = { title: "Find a salon", description: "Find salons and open appointments near you." };
export const dynamic = "force-dynamic";

export default async function FindPage({ searchParams }: { searchParams: Promise<{ where?: string; service?: string; miles?: string }> }) {
  const sp = await searchParams;
  let where = sp.where ?? "";
  let miles = Number(sp.miles) || 25;
  let signedIn = false;
  const who = await whoAmI().catch(() => null);
  if (who?.kind === "customer") {
    signedIn = true;
    const { data } = await createAdminClient().from("customers").select("home_zip,search_miles").eq("id", who.customerId).single();
    if (!where && data?.home_zip) where = data.home_zip;
    if (!sp.miles && data?.search_miles) miles = data.search_miles;
  }
  return <FindView initialWhere={where} initialMiles={miles} initialService={sp.service ?? ""} signedIn={signedIn} />;
}
