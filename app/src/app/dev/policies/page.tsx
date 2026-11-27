import { notFound } from "next/navigation";
import PoliciesForm from "@/app/app/settings/policies/PoliciesForm";
import { toForm } from "@/lib/policy/edit";
import type { PolicySettings } from "@/lib/policy/types";
import policyJson from "../../../../seed/policies.json";

/** Development-only preview of Settings → Policies (404 in production). */
export const dynamic = "force-dynamic";

export default function DevPolicies() {
  if (process.env.NODE_ENV === "production") notFound();
  const policy = policyJson as unknown as PolicySettings;
  return <PoliciesForm initial={toForm(policy)} policy={policy} />;
}
