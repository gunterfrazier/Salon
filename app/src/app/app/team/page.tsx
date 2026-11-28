import { AppNav } from "@/components/AppNav";
import { cleanOverrides, cleanPersonal } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/context";
import TeamView from "./TeamView";
import { cleanTeamSettings } from "@/lib/team/clients";
import { toStylists, type StaffRow } from "@/lib/staff/stylists";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ctx = await requirePermission("team.manage");
  const [{ data }, { data: services }, { data: requests }, { data: codes }, { data: biz }] = await Promise.all([
    ctx.supabase.from("staff").select("id,display_name,email,phone,role,active,auth_user_id,invited_at,created_at,bookable,title,bio,color,hours,service_ids,sort,permissions,suspended_at,suspended_note,clients_copied_at").eq("business_id", ctx.business.id).order("created_at"),
    ctx.supabase.from("services").select("id,name,sort,service_categories(name,sort)").eq("business_id", ctx.business.id).eq("archived", false),
    ctx.supabase.from("salon_join_requests").select("id,name,email,phone,message,code_id,created_at").eq("business_id", ctx.business.id).eq("status", "pending").order("created_at"),
    ctx.supabase.from("salon_join_codes").select("id,code,role,auto_approve,max_uses,uses,expires_at,note,created_at").eq("business_id", ctx.business.id).is("revoked_at", null).order("created_at", { ascending: false }),
    ctx.supabase.from("businesses").select("team_settings").eq("id", ctx.business.id).single(),
  ]);
  type Svc = { id: string; name: string; sort: number; service_categories: { name: string; sort: number } | null };
  const menu = ((services ?? []) as unknown as Svc[])
    .sort((a, b) => (a.service_categories?.sort ?? 99) - (b.service_categories?.sort ?? 99) || a.sort - b.sort)
    .map((x) => ({ id: x.id, name: x.name, category: x.service_categories?.name ?? "Other" }));
  const checkedAt = new Date().getTime();
  const stylists = toStylists((data ?? []) as unknown as StaffRow[], { includeUnbookable: true });
  return (
    <>
      <AppNav current="/app/team" businessName={ctx.business.name} />
      <TeamView
        me={ctx.staff.id}
        isOwner={ctx.staff.role === "owner"}
        salon={ctx.business.name}
        overrides={cleanOverrides(ctx.business.role_permissions)}
        services={menu}
        salonHours={ctx.business.business_hours}
        site={process.env.SITE_URL ?? "https://chairvana.app"}
        teamSettings={cleanTeamSettings(biz?.team_settings)}
        requests={(requests ?? []).map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, message: r.message, viaCode: !!r.code_id, at: r.created_at }))}
        codes={(codes ?? []).map((c) => ({ id: c.id, code: c.code, role: c.role, autoApprove: c.auto_approve, maxUses: c.max_uses, uses: c.uses, expiresAt: c.expires_at, expired: !!c.expires_at && Date.parse(c.expires_at) < checkedAt, note: c.note }))}
        members={(data ?? []).map((m) => {
          const st = stylists.find((x) => x.id === m.id);
          return {
            id: m.id, name: m.display_name, email: m.email, phone: m.phone, role: m.role, active: m.active, suspended: m.suspended_at ? { at: m.suspended_at as string, note: (m.suspended_note as string | null) ?? null } : null, copiedAt: (m.clients_copied_at as string | null) ?? null, joined: !!m.auth_user_id, permissions: cleanPersonal(m.permissions),
            stylist: { bookable: m.bookable, title: m.title ?? "", bio: m.bio ?? "", color: st?.color ?? null, ownColor: m.color, hours: m.hours, serviceIds: m.service_ids?.length ? m.service_ids : null },
          };
        })}
      />
    </>
  );
}
