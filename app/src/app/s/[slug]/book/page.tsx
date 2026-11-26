import { notFound } from "next/navigation";
import BookingWizard from "@/app/book/BookingWizard";
import { whoAmI } from "@/lib/auth/whoami";
import { bookableDates } from "@/lib/booking/availability";
import { loadClosedChecker, loadPublicBusiness, loadPublicServices } from "@/lib/data/public-booking";
import { policyText } from "@/lib/policy/text";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/time/zone";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ services?: string; staff?: string }> };

export async function generateMetadata({ params }: Props) {
  const b = await loadPublicBusiness({ slug: (await params).slug });
  return { title: b ? `Book with ${b.name}` : "Book online" };
}

/** Online booking for one salon: /s/<salon>/book. */
export default async function SalonBookPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const b = await loadPublicBusiness({ slug });
  if (!b) notFound();
  const services = await loadPublicServices(b.id);
  // Signed-in client of this salon? Fill in their details.
  let prefill: { firstName: string; lastName: string; phone: string; email: string } | undefined;
  const who = await whoAmI().catch(() => ({ kind: "signed_out" as const }));
  if (who.kind === "customer") {
    // Their account details (the salon's own record, if any, is matched when they book).
    const { data: c } = await createAdminClient().from("customers").select("first_name,last_name,phone,email").eq("id", who.customerId).single();
    if (c) prefill = { firstName: c.first_name ?? "", lastName: c.last_name ?? "", phone: c.phone ?? "", email: c.email ?? who.user.email ?? "" };
  }
  return (
    <BookingWizard
      salon={b.slug}
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
