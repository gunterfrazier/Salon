import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { mergeMethods } from "@/lib/payments/settings";
import PaymentSettings from "./PaymentSettings";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const ctx = await getContext();
  return (
    <>
      <AppNav current="/settings/payments" businessName={ctx.business.name} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="mt-1 text-muted">Switch on the ways clients can pay you. Change them any time to see what works best.</p>
        <div className="mt-6">
          <PaymentSettings methods={mergeMethods(ctx.business.payment_methods)} />
        </div>
      </main>
    </>
  );
}
