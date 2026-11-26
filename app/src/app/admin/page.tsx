import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { isPlatformAdmin, type Application } from "@/lib/platform/salons";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminView from "./AdminView";

export const metadata = { title: "Platform" };
export const dynamic = "force-dynamic";

/** Platform admin: salon requests and all salons. */
export default async function AdminPage() {
  const ctx = await getContext();
  if (!isPlatformAdmin(ctx.user.email)) notFound();
  const db = createAdminClient();
  const [{ data: apps }, { data: salons }] = await Promise.all([
    db.from("salon_applications").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("businesses").select("id,name,slug,status,listed,city,state,created_at,lat").order("created_at"),
  ]);
  return (
    <>
      <AppNav current="/admin" businessName={ctx.business.name} />
      <AdminView
        mySalon={ctx.business.id}
        applications={(apps ?? []) as (Application & { decision_note: string | null; business_id: string | null })[]}
        salons={(salons ?? []).map((s) => ({ id: s.id, name: s.name, slug: s.slug, status: s.status, listed: s.listed, place: [s.city, s.state].filter(Boolean).join(", "), located: s.lat != null }))}
      />
    </>
  );
}
