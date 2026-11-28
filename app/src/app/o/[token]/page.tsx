import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { accentStyle, branding } from "@/lib/branding";
import { loadOffer, offerChoices } from "@/lib/sick/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDay, formatTime, wallParts } from "@/lib/time/zone";
import OfferView from "./OfferView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pick a new time", robots: { index: false, follow: false } };

/** A client's link when their stylist is out sick: pick a new time, or cancel without a fee. */
export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadOffer(token);
  if (!ctx) notFound();
  const tz = ctx.b.timezone;
  const { data: biz } = await createAdminClient().from("businesses").select("phone,branding").eq("id", ctx.b.id).single();
  const when = (d: Date) => `${formatDay(wallParts(d, tz).date, { weekday: "long", month: "long", day: "numeric" })} at ${formatTime(d, tz)}`;
  const services = ctx.services.map((s) => s.name).join(" + ");
  const sickName = ctx.sick.name.split(" ")[0];
  const phone = (biz?.phone as string | null) ?? null;

  let body: React.ReactNode;
  if (!ctx.usable) {
    const st = ctx.offer.status;
    body = (
      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 text-left">
        <p className="font-semibold">
          {st === "rescheduled" ? "You're all set" : st === "cancelled" ? "Your appointment is cancelled" : "This link has closed"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {st === "rescheduled" ? `Your ${services} is now ${when(ctx.appt.start)}.` : st === "cancelled" ? "There's no fee. If you paid a deposit, the salon will refund it." : "Please contact the salon to find a new time."}
        </p>
        {phone && st !== "rescheduled" && <a href={`tel:${phone}`} className="mt-3 inline-block rounded-full border border-line px-4 py-2 text-sm">Call {ctx.b.name}</a>}
      </div>
    );
  } else {
    const choices = await offerChoices(ctx);
    body = <OfferView token={token} sickName={sickName} settings={{ substitutes: ctx.settings.substitutes }} choices={choices} phone={phone} />;
  }

  return (
    <div style={accentStyle(branding(biz?.branding))}>
      <main className="mx-auto max-w-lg px-4 py-8">
        <p className="text-center text-sm text-muted">{ctx.b.name}</p>
        <h1 className="mt-1 text-center font-display text-3xl">{ctx.usable ? `${sickName} is out sick` : "Your appointment"}</h1>
        {ctx.usable && (
          <p className="mt-2 text-center text-muted">
            {ctx.clientName ? `Hi ${ctx.clientName}, we're` : "We're"} sorry! {sickName} can&rsquo;t make your {services} on {when(ctx.appt.start)}. Pick a new time below.
          </p>
        )}
        {body}
      </main>
      <SiteFooter />
    </div>
  );
}
