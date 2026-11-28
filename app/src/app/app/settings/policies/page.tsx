import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { toForm } from "@/lib/policy/edit";
import PoliciesForm from "./PoliciesForm";
import SickSettingsForm from "./SickSettingsForm";
import { cleanSickSettings } from "@/lib/sick/rules";

export const metadata = { title: "Policies" };
export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const ctx = await requirePermission("settings.payments");
  const { data: sick } = await ctx.supabase.from("businesses").select("sick_settings").eq("id", ctx.business.id).single();
  return (
    <>
      <AppNav current="/app/settings/policies" businessName={ctx.business.name} />
      <PoliciesForm initial={toForm(ctx.business.policy_settings)} policy={ctx.business.policy_settings} />
      <SickSettingsForm initial={cleanSickSettings(sick?.sick_settings)} />
    </>
  );
}
