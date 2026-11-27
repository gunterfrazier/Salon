import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";

export const metadata = { title: "Front desk" };
export const dynamic = "force-dynamic";

const card = "block rounded-2xl border border-line bg-surface p-5 hover:border-accent";
const btn = "rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-background";

/** For the salon's own devices: the check-in kiosk and the screens around the salon. */
export default async function FrontDeskPage() {
  const ctx = await requirePermission(["booking.manage", "calendar.all"]);
  const kiosk = ctx.can("booking.manage");
  const manage = ctx.can("settings.salon");
  const { data } = await ctx.supabase.from("screens").select("id,name,audience").eq("business_id", ctx.business.id).order("sort").order("created_at");
  const screens = data ?? [];
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
        </div>
        <section className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold">Screens</h2>
            {manage && <Link href="/app/screens" className="text-sm underline">Set up screens</Link>}
          </div>
          {screens.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {screens.map((s) => (
                <li key={s.id} className={card}>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-muted">{s.audience === "staff" ? "Staff only" : "Public"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/app/screens/${s.id}/play`} className={btn}>Open on this device</Link>
                    <Link href={`/app/screens/${s.id}/remote`} className={btn}>Remote</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{manage ? "No screens yet. Set up a front-window sign, a waiting-area TV or a stylist station under Screens." : "No screens set up yet. Ask the salon owner."}</p>
          )}
        </section>
      </main>
    </>
  );
}
