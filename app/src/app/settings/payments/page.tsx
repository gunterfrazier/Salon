import methodsJson from "../../../../seed/payment-methods.json";
import type { PaymentMethod } from "@/lib/payments/methods";
import PaymentSettings from "./PaymentSettings";

export const metadata = { title: "Payments" };

export default function PaymentsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Payments</h1>
      <p className="mt-1 text-muted">Link and switch on any payment option, any time. Try different ones to see what works best for your clients.</p>
      <div className="mt-6">
        <PaymentSettings methods={methodsJson.methods as PaymentMethod[]} />
      </div>
    </main>
  );
}
