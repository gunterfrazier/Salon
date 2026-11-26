import { AppNav } from "@/components/AppNav";
import { cleanOverrides } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/context";
import TeamView from "./TeamView";
import { toStylists, type StaffRow } from "@/lib/staff/stylists";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ctx = await requirePermission("team.manage");
  const [{ data }, { data: services }] = await Promise.all([
    ctx.supabase.from("staff").select("id,display_name,email,phone,role,active,auth_user_id,invited_at,created_at,bookable,title,color,hours,service_ids,sort").eq("business_id", ctx.business.id).order("created_at"),
    ctx.supabase.from("services").select("id,name,sort,service_categories(name,sort)").eq("business_id", ctx.business.id).eq("archived", false),
  ]);
  type Svc = { id: string; name: string; sort: number; service_categories: { name: string; sort: number } | null };
  const menu = ((services ?? []) as unknown as Svc[])
    .sort((a, b) => (a.service_categories?.sort ?? 99) - (b.service_categories?.sort ?? 99) || a.sort - b.sort)
    .map((x) => ({ id: x.id, name: x.name, category: x.service_categories?.name ?? "Other" }));
  const stylists = toStylists((data ?? []) as unknown as StaffRow[], { includeUnbookable: true });
  return (
    <>
      <AppNav current="/team" businessName={ctx.business.name} />
      <TeamView
        me={ctx.staff.id}
        isOwner={ctx.staff.role === "owner"}
        salon={ctx.business.name}
        overrides={cleanOverrides(ctx.business.role_permissions)}
        services={menu}
        salonHours={ctx.business.business_hours}
        members={(data ?? []).map((m) => {
          const st = stylists.find((x) => x.id === m.id);
          return {
            id: m.id, name: m.display_name, email: m.email, phone: m.phone, role: m.role, active: m.active, joined: !!m.auth_user_id,
            stylist: { bookable: m.bookable, title: m.title ?? "", color: st?.color ?? null, ownColor: m.color, hours: m.hours, serviceIds: m.service_ids?.length ? m.service_ids : null },
          };
        })}
      />
    </>
  );
}
