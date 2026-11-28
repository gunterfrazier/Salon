import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadLine } from "@/lib/walkins/server";
import { lineBusiness } from "./business";
import WalkinsView from "./WalkinsView";

export const metadata = { title: "Walk-ins" };
export const dynamic = "force-dynamic";

/** The walk-in line: who's waiting, who's next with whom, and wait times. */
export default async function WalkinsPage() {
  const ctx = await requirePermission("booking.manage");
  const b = await lineBusiness(ctx);
  const db = createAdminClient();
  const [view, { data: svcs }, { data: staff }] = await Promise.all([
    loadLine(db, b),
    ctx.supabase.from("services").select("id,name,sort,is_add_on,service_categories(sort)").eq("business_id", ctx.business.id).eq("archived", false),
    ctx.supabase.from("staff").select("id,display_name,pay_type").eq("business_id", ctx.business.id).eq("active", true).is("suspended_at", null).eq("bookable", true).order("sort"),
  ]);
  type Svc = { id: string; name: string; sort: number; is_add_on: boolean; service_categories: { sort: number } | null };
  const menu = ((svcs ?? []) as unknown as Svc[]).filter((s) => !s.is_add_on).sort((a, b) => (a.service_categories?.sort ?? 99) - (b.service_categories?.sort ?? 99) || a.sort - b.sort).map((s) => ({ id: s.id, name: s.name }));
  return (
    <>
      <AppNav current="/app/walkins" businessName={ctx.business.name} />
      <WalkinsView
        view={{ ...view, prediction: undefined }}
        menu={menu}
        team={(staff ?? []).map((s) => ({ id: s.id as string, name: s.display_name as string, commission: s.pay_type === "commission" }))}
        canSetUp={ctx.can("settings.payments")}
      />
    </>
  );
}
