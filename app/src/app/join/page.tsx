import SiteFooter from "@/components/SiteFooter";
import JoinForm from "./JoinForm";

export const metadata = { title: "List your salon", description: "Bring your salon to Chairvana: online booking, reminders, clients and more." };

export default function JoinPage() {
  return (
    <>
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-3xl font-bold">List your salon</h1>
      <p className="mt-2 text-muted">Online booking with deposits, reminders, client records, color formulas, inventory and reports. Tell us about your salon and we&apos;ll set you up.</p>
      <JoinForm />
    </main>
      <SiteFooter />
    </>
  );
}
