import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeJoinCode } from "@/lib/team/codes";
import JoinSalonView from "./JoinSalonView";

export const metadata = { title: "Join a salon" };
export const dynamic = "force-dynamic";

/** A stylist joins a salon's team: with the salon's code, or by asking. */
export default async function JoinSalonPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const { data } = await createAdminClient()
    .from("salon_join_requests")
    .select("id,status,created_at,decided_at,businesses(name)")
    .eq("auth_user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  type Row = { id: string; status: string; created_at: string; businesses: { name: string } | null };
  return (
    <>
      <AppNav current="/app/join-salon" businessName={ctx.business.name} />
      <JoinSalonView
        code={normalizeJoinCode(sp.code)}
        requests={((data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, status: r.status, salon: r.businesses?.name ?? "Salon", at: r.created_at }))}
      />
    </>
  );
}
