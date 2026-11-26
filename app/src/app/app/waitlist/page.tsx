import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { visibleClientIds } from "@/lib/data/client-scope";
import { loadPublicServices } from "@/lib/data/public-booking";
import { loadWaitlist } from "@/lib/data/waitlist";
import { todayIn } from "@/lib/time/zone";
import WaitlistView from "./WaitlistView";

export const metadata = { title: "Waitlist" };
export const dynamic = "force-dynamic";

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const ctx = await requirePermission("booking.manage");
  const sp = await searchParams;
  const scope = await visibleClientIds(ctx);
  const [items, services, { data: staff }, { data: clients }] = await Promise.all([
    loadWaitlist(ctx.supabase, ctx.business.id, scope ? { clientIds: [...scope] } : {}),
    loadPublicServices(ctx.business.id),
    ctx.supabase.from("staff").select("id,display_name").eq("business_id", ctx.business.id).eq("active", true).eq("bookable", true).order("sort"),
    ctx.supabase.from("clients").select("id,first_name,last_name,phone").eq("business_id", ctx.business.id).order("first_name").limit(10000),
  ]);
  const visible = (clients ?? []).filter((c) => !scope || scope.has(c.id));
  return (
    <>
      <AppNav current="/app/waitlist" businessName={ctx.business.name} />
      <WaitlistView
        items={items}
        services={services.filter((s) => !s.is_add_on).map((s) => ({ id: s.id, name: s.name, category: s.category }))}
        stylists={(staff ?? []).map((s) => ({ id: s.id, name: s.display_name }))}
        clients={visible.map((c) => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" "), phone: c.phone }))}
        today={todayIn(ctx.business.timezone)}
        initialClient={sp.client ?? null}
      />
    </>
  );
}
