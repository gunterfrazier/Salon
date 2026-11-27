import { notFound } from "next/navigation";
import BookingWizard from "@/app/book/BookingWizard";
import { whoAmI } from "@/lib/auth/whoami";
import { bookableDates } from "@/lib/booking/availability";
import { loadClosedChecker, loadPublicBusiness, loadPublicServices } from "@/lib/data/public-booking";
import { policyText } from "@/lib/policy/text";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/time/zone";
import { loadLoyalty } from "@/lib/promo/rewards";
import { rewardLabel } from "@/lib/promo/loyalty";
import { accentStyle, branding } from "@/lib/branding";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ services?: string; staff?: string; date?: string; time?: string; ref?: string }> };

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
  // A friend's referral link (?ref=CODE): show what the new client gets.
  let referral: { code: string; from: string; reward: string } | null = null;
  const ref = (sp.ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  if (ref.length >= 4) {
    const db = createAdminClient();
    const s = await loadLoyalty(db, b.id);
    if (s.referral.enabled) {
      const { data: r } = await db.from("clients").select("first_name").eq("business_id", b.id).eq("referral_code", ref).maybeSingle();
      if (r) referral = { code: ref, from: r.first_name, reward: rewardLabel(s.referral.friend) };
    }
  }
  const { data: look } = await createAdminClient().from("businesses").select("branding").eq("id", b.id).single();
  return (
    <div style={accentStyle(branding(look?.branding))}>
    <BookingWizard
      referral={referral}
      salon={b.slug}
      business={{ name: b.name, timezone: b.timezone, hours: b.hours, policy: b.policy, rules: b.rules }}
      services={services}
      dates={bookableDates(todayIn(b.timezone), b.hours, b.settings, await loadClosedChecker(b))}
      policyLines={policyText(b.policy)}
      initialPicked={(sp.services ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 8)}
      prefill={prefill}
      stylists={b.stylists.map((s) => ({ id: s.id, name: s.name, title: s.title, serviceIds: s.serviceIds }))}
      initialStaff={b.stylists.some((s) => s.id === sp.staff) ? sp.staff! : null}
      initialSlot={sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.time && /^\d{2}:\d{2}$/.test(sp.time) ? { date: sp.date, time: sp.time } : null}
    />
    </div>
  );
}
