import { AppNav } from "@/components/AppNav";
import { cleanOverrides } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/context";
import TeamView from "./TeamView";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ctx = await requirePermission("team.manage");
  const { data } = await ctx.supabase.from("staff").select("id,display_name,email,phone,role,active,auth_user_id,invited_at,created_at").eq("business_id", ctx.business.id).order("created_at");
  return (
    <>
      <AppNav current="/team" businessName={ctx.business.name} />
      <TeamView
        me={ctx.staff.id}
        isOwner={ctx.staff.role === "owner"}
        salon={ctx.business.name}
        overrides={cleanOverrides(ctx.business.role_permissions)}
        members={(data ?? []).map((m) => ({ id: m.id, name: m.display_name, email: m.email, phone: m.phone, role: m.role, active: m.active, joined: !!m.auth_user_id }))}
      />
    </>
  );
}
