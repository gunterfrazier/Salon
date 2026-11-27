import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { mergeMethods } from "@/lib/payments/settings";
import PaymentSettings from "./PaymentSettings";
import Link from "next/link";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const ctx = await requirePermission("settings.payments");
  return (
    <>
      <AppNav current="/app/settings/payments" businessName={ctx.business.name} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="mt-1 text-muted">Switch on the ways clients can pay you. Change them any time to see what works best.</p>
        <div className="mt-6">
          <PaymentSettings methods={mergeMethods(ctx.business.payment_methods)} />
        </div>
        <p className="mt-8 text-sm text-muted">
          Deposits, cancellation fees and no-show rules are under <Link href="/app/settings/policies" className="underline">Policies</Link>.
        </p>
      </main>
    </>
  );
}
