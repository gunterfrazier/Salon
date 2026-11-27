import { AppNav } from "@/components/AppNav";
import { roleLabel } from "@/lib/auth/permissions";
import { getContext } from "@/lib/context";
import { daysLeft, licenseStatus, lookupLink } from "@/lib/licenses/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import LicensesView, { type LicenseCard } from "./LicensesView";

export const metadata = { title: "Licenses" };
export const dynamic = "force-dynamic";

type Row = { id: string; auth_user_id: string | null; business_id: string | null; kind: string; state: string; number: string; holder_name: string | null; expires_on: string | null; file_path: string | null };

/** Your licenses, the salon's license, and (managing the team) everyone's. */
export default async function LicensesPage() {
  const ctx = await getContext();
  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const manage = ctx.can("team.manage");

  const { data: team } = manage
    ? await db.from("staff").select("id,display_name,role,auth_user_id,active,suspended_at").eq("business_id", ctx.business.id).eq("active", true).order("created_at")
    : { data: [] };
  const userIds = [...new Set([ctx.user.id, ...(team ?? []).map((t) => t.auth_user_id as string | null).filter((x): x is string => !!x)])];
  const [{ data: people }, { data: salonRows }, { data: checks }, { data: biz }] = await Promise.all([
    db.from("licenses").select("id,auth_user_id,business_id,kind,state,number,holder_name,expires_on,file_path").in("auth_user_id", userIds).order("created_at"),
    db.from("licenses").select("id,auth_user_id,business_id,kind,state,number,holder_name,expires_on,file_path").eq("business_id", ctx.business.id).order("created_at"),
    db.from("license_checks").select("license_id,verified_at,note").eq("business_id", ctx.business.id),
    db.from("businesses").select("block_expired_license").eq("id", ctx.business.id).single(),
  ]);
  const checkOf = new Map((checks ?? []).map((c) => [c.license_id as string, { at: c.verified_at as string, note: (c.note as string | null) ?? null }]));
  const card = (l: Row): LicenseCard => ({
    id: l.id,
    kind: l.kind,
    state: l.state,
    number: l.number,
    holderName: l.holder_name,
    expiresOn: l.expires_on,
    hasFile: !!l.file_path,
    status: licenseStatus(l.expires_on, today),
    daysLeft: l.expires_on ? daysLeft(l.expires_on, today) : null,
    confirmed: checkOf.get(l.id) ?? null,
    lookup: lookupLink(l.state, l.kind),
  });
  const all = (people ?? []) as Row[];
  return (
    <>
      <AppNav current="/app/licenses" businessName={ctx.business.name} />
      <LicensesView
        salon={ctx.business.name}
        mine={all.filter((l) => l.auth_user_id === ctx.user.id).map(card)}
        salonLicenses={((salonRows ?? []) as Row[]).map(card)}
        canEditSalon={ctx.can("settings.salon")}
        manage={manage}
        blockExpired={!!biz?.block_expired_license}
        team={(team ?? [])
          .filter((t) => t.auth_user_id !== ctx.user.id)
          .map((t) => ({
            id: t.id as string,
            name: t.display_name as string,
            role: roleLabel(t.role as string),
            joined: !!t.auth_user_id,
            suspended: !!t.suspended_at,
            licenses: all.filter((l) => l.auth_user_id && l.auth_user_id === t.auth_user_id).map(card),
          }))}
      />
    </>
  );
}
