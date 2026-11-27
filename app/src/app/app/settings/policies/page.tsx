import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { toForm } from "@/lib/policy/edit";
import PoliciesForm from "./PoliciesForm";

export const metadata = { title: "Policies" };
export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const ctx = await requirePermission("settings.payments");
  return (
    <>
      <AppNav current="/app/settings/policies" businessName={ctx.business.name} />
      <PoliciesForm initial={toForm(ctx.business.policy_settings)} policy={ctx.business.policy_settings} />
    </>
  );
}
