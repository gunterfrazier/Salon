import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";

export const metadata = { title: "Front desk" };
export const dynamic = "force-dynamic";

const card = "block rounded-2xl border border-line bg-surface p-5 hover:border-accent";
const btn = "rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-background";

/** Screens for the shop's tablet and TV: the check-in kiosk and the salon display. */
export default async function FrontDeskPage() {
  const ctx = await requirePermission(["booking.manage", "calendar.all"]);
  const kiosk = ctx.can("booking.manage");
  const display = ctx.can("calendar.all");
  return (
    <>
      <AppNav current="/app/front-desk" businessName={ctx.business.name} />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <header>
          <h1 className="font-display text-3xl">Front desk</h1>
          <p className="text-sm text-muted">Open these on the device that stays at the salon: a tablet by the door, or the TV in the waiting area.</p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          {kiosk && (
            <section className={card}>
              <h2 className="text-lg font-semibold">Check-in kiosk</h2>
              <p className="mt-1 text-sm text-muted">Clients tap their name when they arrive. You get a check-in alert, and any forms they still need open right there.</p>
              <Link href="/app/kiosk" className={`${btn} mt-4 inline-block`}>Open kiosk</Link>
            </section>
          )}
          {display && (
            <section className={card}>
              <h2 className="text-lg font-semibold">TV display</h2>
              <p className="mt-1 text-sm text-muted">Today&rsquo;s chairs, specials, 5-star reviews and a booking QR code. Updates itself every minute.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/app/display" className={btn}>Open on a TV</Link>
                <Link href="/app/display?touch=1" className={btn}>Touch screen version</Link>
              </div>
              <p className="mt-2 text-xs text-muted">The touch version adds day arrows and a Check in button, for a smart board or large tablet.</p>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
