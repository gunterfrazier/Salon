import { bookableDates } from "@/lib/booking/availability";
import { loadClosedChecker, loadPublicBusiness, loadPublicServices } from "@/lib/data/public-booking";
import { policyText } from "@/lib/policy/text";
import { todayIn } from "@/lib/time/zone";
import BookingWizard from "./BookingWizard";
import { whoAmI } from "@/lib/auth/whoami";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const b = await loadPublicBusiness();
  return { title: b ? `Book with ${b.name}` : "Book online" };
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ services?: string; staff?: string }> }) {
  const sp = await searchParams;
  const b = await loadPublicBusiness();
  if (!b) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Online booking isn&rsquo;t open yet</h1>
      </main>
    );
  }
  const services = await loadPublicServices(b.id);
  // Signed-in client? Fill in their details.
  let prefill: { firstName: string; lastName: string; phone: string; email: string } | undefined;
  const who = await whoAmI().catch(() => ({ kind: "signed_out" as const }));
  if (who.kind === "client" && who.businessId === b.id) {
    const { data: c } = await createAdminClient().from("clients").select("first_name,last_name,phone,email").eq("id", who.clientId).single();
    if (c) prefill = { firstName: c.first_name ?? "", lastName: c.last_name ?? "", phone: c.phone ?? "", email: c.email ?? who.user.email ?? "" };
  }
  return (
    <BookingWizard
      business={{ name: b.name, timezone: b.timezone, hours: b.hours, policy: b.policy, rules: b.rules }}
      services={services}
      dates={bookableDates(todayIn(b.timezone), b.hours, b.settings, await loadClosedChecker(b))}
      policyLines={policyText(b.policy)}
      initialPicked={(sp.services ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 8)}
      prefill={prefill}
      stylists={b.stylists.map((s) => ({ id: s.id, name: s.name, title: s.title, serviceIds: s.serviceIds }))}
      initialStaff={b.stylists.some((s) => s.id === sp.staff) ? sp.staff! : null}
    />
  );
}
