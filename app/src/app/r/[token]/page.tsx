import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { createAdminClient } from "@/lib/supabase/admin";
import RateVisit from "./RateVisit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rate your visit", robots: { index: false, follow: false } };

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const { data: r } = await createAdminClient().from("reviews").select("status,services,rating,businesses(name,slug),staff(display_name)").eq("token", token).maybeSingle();
  if (!r) notFound();
  const salon = r.businesses as unknown as { name: string; slug: string } | null;
  const stylist = (r.staff as unknown as { display_name: string } | null)?.display_name?.split(" ")[0] ?? null;
  return (
    <>
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-muted">{salon?.name}</p>
        <h1 className="mt-1 font-display text-4xl">How was your visit?</h1>
        {r.services && <p className="mt-2 text-muted">{r.services}{stylist ? ` with ${stylist}` : ""}</p>}
        {r.status === "requested" ? (
          <RateVisit token={token} salonSlug={salon?.slug ?? null} stylist={stylist} />
        ) : (
          <p className="mt-8 rounded-2xl border border-line bg-surface p-5">You&rsquo;ve already rated this visit. Thank you!</p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
