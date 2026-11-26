import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSalonProfile } from "@/lib/data/salon-profile";
import { whoAmI } from "@/lib/auth/whoami";
import { createAdminClient } from "@/lib/supabase/admin";
import PreferButton from "./PreferButton";
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

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <header>
        <p className="text-xs text-muted">
          <Link href="/find" className="underline">Find a salon</Link>
        </p>
        <h1 className="mt-1 text-3xl font-bold">{s.name}</h1>
        {address && (
          <p className="mt-1 text-sm">
            {map ? <a href={map} target="_blank" rel="noreferrer" className="underline">{address}</a> : address}
          </p>
        )}
        {s.phone && <p className="text-sm"><a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="underline">{s.phone}</a></p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={book(focus ? `?staff=${focus.id}` : "")} className="rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent">
            {focus ? `Book with ${focus.name.split(" ")[0]}` : "Book online"}
          </Link>
          {pref && <span className="self-center"><PreferButton businessId={s.id} label="Make this my salon" active={pref.business === s.id} /></span>}
          {!pref && <Link href="/signup" className="self-center text-sm underline">Create an account to save this salon</Link>}
        </div>
      </header>

      {s.about && <p className="whitespace-pre-wrap">{s.about}</p>}

      {s.stylists.length > 1 && (
        <section>
          <h2 className="text-lg font-semibold">Stylists</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {s.stylists.map((x) => (
              <li key={x.id} className={`rounded-xl border bg-surface p-3 ${focus?.id === x.id ? "border-foreground" : "border-line"}`}>
                <p className="font-semibold">{x.name}</p>
                {x.title && <p className="text-sm text-muted">{x.title}</p>}
                {x.bio && <p className="mt-1 text-sm">{x.bio}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <Link href={book(`?staff=${x.id}`)} className="underline">Book</Link>
                  <Link href={`/s/${s.slug}?stylist=${x.id}`} className="underline">Services</Link>
                  {pref && <PreferButton businessId={s.id} staffId={x.id} label={`Make ${x.name.split(" ")[0]} my stylist`} active={pref.staff === x.id} />}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">{focus ? `${focus.name.split(" ")[0]}'s services` : "Services"}</h2>
        {focus && <p className="text-sm"><Link href={`/s/${s.slug}`} className="underline">Show all services</Link></p>}
        {cats.map((c) => (
          <div key={c} className="mt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{c}</h3>
            <ul className="mt-1 divide-y divide-line rounded-xl border border-line bg-surface">
              {services.filter((x) => x.category === c).map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="font-medium">{x.name}</span>
                    <span className="block text-xs text-muted">{duration(x.active_min + x.processing_min + x.finish_min)}{x.description ? ` · ${x.description}` : ""}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{x.price_type === "free" ? "Free" : `${money(x.price_cents)}${x.price_type === "starting_at" ? "+" : ""}`}</span>
                    <Link href={book(`?services=${x.id}${focus ? `&staff=${focus.id}` : ""}`)} className="text-xs underline">Book</Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {services.length === 0 && <p className="text-sm text-muted">Services coming soon.</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Hours ({tz})</h2>
        <ul className="mt-1 text-sm">
          {WEEKDAY_KEYS.map((k) => {
            const h = s.hours[k];
            return (
              <li key={k} className="flex justify-between border-b border-line py-1">
                <span>{DAY[k]}</span>
                <span>{h ? `${formatMinutes(parseHHMM(h[0]))} – ${formatMinutes(parseHHMM(h[1]))}` : "Closed"}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
