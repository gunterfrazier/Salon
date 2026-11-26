"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import SearchControls from "@/components/SearchControls";
import type { SearchCriteria } from "@/lib/booking/search";
import type { SalonResult } from "@/lib/discovery/openings";
import { money } from "@/lib/format";
import { formatDay, formatMinutes, toHHMM, tzAbbrev, zonedToUtc } from "@/lib/time/zone";
import { searchArea, type AreaSearch } from "./actions";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base";

/** Find salons and openings near a ZIP or city. */
export default function FindView({ initialWhere, initialMiles, initialService, signedIn }: { initialWhere: string; initialMiles: number; initialService: string; signedIn: boolean }) {
  const [where, setWhere] = useState(initialWhere);
  const [miles, setMiles] = useState(initialMiles);
  const [service, setService] = useState(initialService);
  const [criteria, setCriteria] = useState<SearchCriteria>({ weekdays: [], block: "any", start: { kind: "next" } });
  const [res, setRes] = useState<AreaSearch | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setRes(await searchArea({ where, miles, service, criteria }));
    });

  // Search right away when we already know where (signed-in customers, shared links).
  useEffect(() => {
    if (initialWhere) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold">Find a salon</h1>
        <nav className="text-sm">
          {signedIn ? <Link href="/me" className="underline">My appointments</Link> : <><Link href="/login" className="underline">Sign in</Link> · <Link href="/signup" className="underline">Create an account</Link></>}
        </nav>
      </header>

      <form
        className="space-y-3 rounded-2xl border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label className="block text-sm font-medium">
          What do you need? (optional)
          <input className={`${input} mt-1`} value={service} onChange={(e) => setService(e.target.value)} placeholder="Women's cut, highlights, blowout…" />
        </label>
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <label className="text-sm font-medium">
            Near
            <input className={`${input} mt-1`} value={where} onChange={(e) => setWhere(e.target.value)} placeholder="ZIP or City, ST" inputMode="text" />
          </label>
          <label className="text-sm font-medium">
            Within
            <select className={`${input} mt-1`} value={miles} onChange={(e) => setMiles(Number(e.target.value))}>
              {[5, 10, 25, 50, 100].map((m) => <option key={m} value={m}>{m} miles</option>)}
            </select>
          </label>
        </div>
        {service.trim() && (
          <details className="text-sm">
            <summary className="cursor-pointer underline">Days and times</summary>
            <div className="mt-2">
              <SearchControls criteria={criteria} onChange={setCriteria} openDays={[0, 1, 2, 3, 4, 5, 6]} zone="local time" />
            </div>
          </details>
        )}
        <button disabled={pending || !where.trim()} className="w-full rounded-lg bg-foreground py-3 font-semibold text-background disabled:opacity-50">
          {pending ? "Searching…" : service.trim() ? "Find openings" : "Find salons"}
        </button>
      </form>

      {res && !res.ok && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{res.error}</p>}
      {res?.ok && <Results res={res} service={service} />}
    </main>
  );
}

function Results({ res, service }: { res: Extract<AreaSearch, { ok: true }>; service: string }) {
  if (!res.salons.length) return <p className="text-sm">No salons on Chairvana within that distance of {res.place} yet. Try a wider distance.</p>;
  const withOpenings = new Set(res.results?.map((r) => r.salon.id) ?? []);
  return (
    <section className="space-y-3" aria-live="polite">
      <p className="text-sm text-muted">
        {res.salons.length} salon{res.salons.length === 1 ? "" : "s"} near {res.place}
        {res.results ? ` · ${res.results.length} with openings for “${service.trim()}”` : ""}
      </p>
      {res.results?.map((r) => <OpeningsCard key={r.salon.id} r={r} />)}
      {res.salons
        .filter((s) => !withOpenings.has(s.id))
        .map((s) => (
          <article key={s.id} className="rounded-xl border border-line bg-surface p-4">
            <Link href={`/s/${s.slug}`} className="font-semibold underline">{s.name}</Link>
            <p className="text-sm text-muted">{[s.city, s.state].filter(Boolean).join(", ")} · {s.miles < 1 ? "under 1" : Math.round(s.miles)} mi</p>
            {res.results && <p className="mt-1 text-sm text-muted">No matching openings found. See their services and book from their page.</p>}
          </article>
        ))}
    </section>
  );
}

export function OpeningsCard({ r }: { r: SalonResult }) {
  const tz = r.salon.timezone;
  const svc = r.services.map((s) => s.id).join(",");
  const price = r.services.reduce((n, s) => n + s.priceCents, 0);
  const plus = r.services.some((s) => s.priceType === "starting_at");
  const href = (date: string, minutes: number) => `/s/${r.salon.slug}/book?services=${svc}${r.staffId ? `&staff=${r.staffId}` : ""}&date=${date}&time=${toHHMM(minutes)}`;
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/s/${r.salon.slug}`} className="font-semibold underline">{r.salon.name}</Link>
        <span className="text-sm text-muted">{r.salon.place}{r.salon.miles !== null ? ` · ${r.salon.miles < 1 ? "under 1" : Math.round(r.salon.miles)} mi` : ""}</span>
      </div>
      <p className="text-sm text-muted">
        {r.services.map((s) => s.name).join(" + ")} · {money(price)}{plus ? "+" : ""}{r.staffName ? ` · with ${r.staffName}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {r.openings.map((o) => (
          <Link key={`${o.date}${o.minutes}`} href={href(o.date, o.minutes)} className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-background">
            {formatDay(o.date, { weekday: "short", month: "short", day: "numeric" })} · {formatMinutes(o.minutes)} {tzAbbrev(zonedToUtc(o.date, o.minutes, tz), tz)}
          </Link>
        ))}
      </div>
    </article>
  );
}
