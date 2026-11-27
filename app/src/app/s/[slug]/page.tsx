import SiteFooter from "@/components/SiteFooter";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSalonProfile } from "@/lib/data/salon-profile";
import { whoAmI } from "@/lib/auth/whoami";
import { createAdminClient } from "@/lib/supabase/admin";
import PreferButton from "./PreferButton";
import ShareButton from "./ShareButton";
import { duration, money } from "@/lib/format";
import { formatMinutes, parseHHMM, tzAbbrev, WEEKDAY_KEYS } from "@/lib/time/zone";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ stylist?: string }> };

export async function generateMetadata({ params }: Props) {
  const s = await loadSalonProfile((await params).slug);
  return s ? { title: s.name, description: s.about ?? `Book online with ${s.name}${s.city ? ` in ${s.city}, ${s.state}` : ""}.` } : { title: "Salon not found" };
}

const DAY = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" } as const;

/** A salon's public page: about, address, hours, stylists, services and booking. */
export default async function SalonPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const s = await loadSalonProfile(slug);
  if (!s) notFound();
  // Signed-in customer: show "my salon / my stylist" buttons.
  const who = await whoAmI().catch(() => null);
  let pref: { business: string | null; staff: string | null } | null = null;
  if (who?.kind === "customer") {
    const { data } = await createAdminClient().from("customers").select("preferred_business_id,preferred_staff_id").eq("id", who.customerId).single();
    pref = { business: data?.preferred_business_id ?? null, staff: data?.preferred_staff_id ?? null };
  }
  const focus = s.stylists.find((x) => x.id === sp.stylist) ?? null;
  const address = [s.street, [s.city, s.state].filter(Boolean).join(", "), s.zip].filter(Boolean).join(" ");
  const map = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${address}`)}` : null;
  const tz = tzAbbrev(new Date(), s.timezone);
  const services = focus?.serviceIds ? s.services.filter((x) => focus.serviceIds!.includes(x.id)) : s.services;
  const cats = [...new Set(services.map((x) => x.category))];
  const book = (q = "") => `/s/${s.slug}/book${q}`;

  const initials = s.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const place = [s.city, s.state].filter(Boolean).join(", ");

  return (
    <>
      {/* Cover: the salon's own photo will go here; until then, the Chairvana obsidian with its monogram. */}
      <header className="brand-dark relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-6 opacity-[0.07]" aria-hidden="true">
          <svg viewBox="0 0 200 200" className="size-72"><circle cx="100" cy="100" r="98" fill="none" stroke="#b9dcf2" strokeWidth="1" /><circle cx="100" cy="100" r="70" fill="none" stroke="#f5efe6" strokeWidth="1" /><circle cx="100" cy="100" r="42" fill="none" stroke="#b9dcf2" strokeWidth="1" /></svg>
        </div>
        <div className="relative mx-auto max-w-2xl px-4 pb-6 pt-4">
          <div className="flex items-center justify-between">
            <Link href="/find" className="text-sm text-muted hover:text-foreground">‹ Find a salon</Link>
            <div className="flex items-center gap-2">
              <ShareButton title={s.name} />
            </div>
          </div>
          <div className="mt-6 flex items-end gap-4">
            <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface font-display text-3xl">{initials}</span>
            <div className="min-w-0">
              <h1 className="font-display text-4xl leading-tight">{s.name}</h1>
              {place && <p className="text-sm text-muted">{place}</p>}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href={book(focus ? `?staff=${focus.id}` : "")} className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background">
              {focus ? `Book with ${focus.name.split(" ")[0]}` : "Book now"}
            </Link>
            {pref && <PreferButton businessId={s.id} label="Make this my salon" active={pref.business === s.id} />}
            {!pref && <Link href="/signup" className="text-sm text-muted underline">Save this salon</Link>}
          </div>
        </div>
      </header>

      <nav aria-label="On this page" className="sticky top-0 z-30 border-b border-line bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-6 px-4 text-sm">
          <a href="#services" className="border-b-2 border-foreground py-3 font-semibold">Services</a>
          {s.stylists.length > 1 && <a href="#team" className="py-3 text-muted hover:text-foreground">Team</a>}
          <a href="#details" className="py-3 text-muted hover:text-foreground">Details</a>
        </div>
      </nav>

    <main className="mx-auto max-w-2xl space-y-8 px-4 py-6 pb-28">
      <section id="services" className="scroll-mt-14">
        <h2 className="font-display text-2xl">{focus ? `${focus.name.split(" ")[0]}'s services` : "Services"}</h2>
        {focus && <p className="text-sm"><Link href={`/s/${s.slug}`} className="underline">Show all services</Link></p>}
        {cats.map((c) => (
          <div key={c} className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{c}</h3>
            <ul className="mt-1 divide-y divide-line">
              {services.filter((x) => x.category === c).map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="font-medium">{x.name}</span>
                    {x.description && <span className="block text-sm text-muted">{x.description}</span>}
                    <span className="mt-0.5 block text-xs text-muted">{duration(x.active_min + x.processing_min + x.finish_min)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-right font-mono text-sm font-semibold">{x.price_type === "free" ? "Free" : `${money(x.price_cents)}${x.price_type === "starting_at" ? "+" : ""}`}</span>
                    <Link href={book(`?services=${x.id}${focus ? `&staff=${focus.id}` : ""}`)} className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background" aria-label={`Book ${x.name}`}>
                      Book
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {services.length === 0 && <p className="text-sm text-muted">Services coming soon.</p>}
      </section>

      {s.stylists.length > 1 && (
        <section id="team" className="scroll-mt-14">
          <h2 className="font-display text-2xl">Team</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {s.stylists.map((x) => (
              <li key={x.id} className={`flex gap-3 rounded-2xl border bg-surface p-3 ${focus?.id === x.id ? "border-foreground" : "border-line"}`}>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-background font-semibold">{x.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                <span className="min-w-0">
                  <span className="block font-semibold">{x.name}</span>
                  {x.title && <span className="block text-sm text-muted">{x.title}</span>}
                  {x.bio && <span className="mt-1 block text-sm">{x.bio}</span>}
                  <span className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <Link href={book(`?staff=${x.id}`)} className="font-semibold underline">Book</Link>
                    <Link href={`/s/${s.slug}?stylist=${x.id}#services`} className="underline">Services</Link>
                    {pref && <PreferButton businessId={s.id} staffId={x.id} label={`Make ${x.name.split(" ")[0]} my stylist`} active={pref.staff === x.id} />}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="details" className="scroll-mt-14 space-y-4">
        <h2 className="font-display text-2xl">Details</h2>
        {s.about && <p className="whitespace-pre-wrap">{s.about}</p>}
        {(address || s.phone) && (
          <div className="space-y-1 text-sm">
            {address && <p>{map ? <a href={map} target="_blank" rel="noreferrer" className="underline">{address}</a> : address}</p>}
            {s.phone && <p><a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="underline">{s.phone}</a></p>}
          </div>
        )}
        <div>
          <h3 className="font-semibold">Hours ({tz})</h3>
          <ul className="mt-1 text-sm">
            {WEEKDAY_KEYS.map((k) => {
              const h = s.hours[k];
              return (
                <li key={k} className="flex justify-between border-b border-line py-1.5">
                  <span>{DAY[k]}</span>
                  <span className="font-mono">{h ? `${formatMinutes(parseHHMM(h[0]))} – ${formatMinutes(parseHHMM(h[1]))}` : "Closed"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <Link href={book(focus ? `?staff=${focus.id}` : "")} className="block rounded-full bg-foreground py-3 text-center font-semibold text-background">
          {focus ? `Book with ${focus.name.split(" ")[0]}` : "Book now"}
        </Link>
      </div>
      <SiteFooter />
    </>
  );
}
