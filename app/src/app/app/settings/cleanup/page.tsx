import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import CleanupView, { type CleanupClient } from "./CleanupView";

export const metadata = { title: "Clean up test data" };
export const dynamic = "force-dynamic";

export default async function CleanupPage() {
  const ctx = await requirePermission("team.manage");
  const db = ctx.supabase;
  const biz = ctx.business.id;
  const [{ data: clients }, { data: appts }, { data: pays }] = await Promise.all([
    db.from("clients").select("id,first_name,last_name,phone,email,source,created_at").eq("business_id", biz).order("created_at", { ascending: false }).limit(5000),
    db.from("appointments").select("client_id,status").eq("business_id", biz).limit(50000),
    db.from("payments").select("client_id,amount_cents").eq("business_id", biz).not("client_id", "is", null).limit(50000),
  ]);
  const visits = new Map<string, { booked: number; done: number }>();
  for (const a of appts ?? []) {
    const v = visits.get(a.client_id) ?? { booked: 0, done: 0 };
    v.booked++;
    if (a.status === "completed") v.done++;
    visits.set(a.client_id, v);
  }
  const paid = new Map<string, number>();
  for (const p of pays ?? []) paid.set(p.client_id as string, (paid.get(p.client_id as string) ?? 0) + (p.amount_cents ?? 0));

  const rows: CleanupClient[] = (clients ?? []).map((c) => ({
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    contact: c.phone || c.email || "",
    email: c.email,
    source: c.source,
    created: c.created_at,
    booked: visits.get(c.id)?.booked ?? 0,
    done: visits.get(c.id)?.done ?? 0,
    paid: paid.get(c.id) ?? 0,
  }));

  return (
    <>
      <AppNav current="/app/clients" businessName={ctx.business.name} />
      <CleanupView clients={rows} tz={ctx.business.timezone} />
    </>
  );
}
