"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import SearchControls from "@/components/SearchControls";
import type { Favorites, Opening, SearchCriteria } from "@/lib/booking/search";
import type { CalendarData } from "@/lib/data/calendar-types";
import { fullName, money } from "@/lib/format";
import { formatDay, formatSlot, toHHMM, tzAbbrev, WEEKDAY_KEYS, zoneLabel } from "@/lib/time/zone";
import { findTimes } from "./actions";
import { Sheet } from "./CloseSheet";

export interface FindTimeStart {
  title?: string;
  serviceIds?: string[];
  clientId?: string | null;
  criteria?: Partial<SearchCriteria>;
  /** Booking the next visit at checkout: highlight the 2/4/6/8-week buttons. */
  rebook?: boolean;
}

/** Search openings, then hand the chosen slot to the booking form. */
export default function FindTimeSheet({
  data, start, onClose, onPick,
}: {
  data: CalendarData;
  start: FindTimeStart;
  onClose: () => void;
  onPick: (p: { date: string; time: string; serviceIds: string[]; clientId: string | null }) => void;
}) {
  const client = data.clients.find((c) => c.id === start.clientId) ?? null;
  const fav: Favorites | null = client?.favorites ?? null;
  const [serviceIds, setServiceIds] = useState<string[]>(start.serviceIds?.length ? start.serviceIds : fav?.serviceIds.filter((id) => data.services.some((s) => s.id === id)) ?? []);
  const [criteria, setCriteria] = useState<SearchCriteria>({
    weekdays: fav?.weekdays ?? [],
    block: fav?.block ?? "any",
    start: { kind: "next" },
    ...start.criteria,
  });
  const [results, setResults] = useState<Opening[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const groups = useMemo(() => {
    const g = new Map<string, CalendarData["services"]>();
    for (const s of data.services) g.set(s.category, [...(g.get(s.category) ?? []), s]);
    return [...g.entries()];
  }, [data.services]);
  const openDays = WEEKDAY_KEYS.map((k, i) => (data.hours[k] ? i : -1)).filter((i) => i >= 0);

  // Search again whenever the services or criteria change.
  useEffect(() => {
    if (!serviceIds.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }
    setError(null);
    startLoading(async () => {
      const r = await findTimes(serviceIds, criteria);
      if (r.ok) setResults(r.openings);
      else setError(r.error);
    });
  }, [serviceIds, criteria]);

  const byDate = useMemo(() => {
    const m = new Map<string, Opening[]>();
    for (const o of results ?? []) m.set(o.date, [...(m.get(o.date) ?? []), o]);
    return [...m.entries()];
  }, [results]);
  const zone = tzAbbrev(new Date(), data.timezone);

  return (
    <Sheet
      title={start.title ?? "Find a time"}
      onClose={onClose}
      footer={<p className="text-xs text-muted">Times in {zoneLabel(data.timezone)}. Closed days are skipped. Book them from the calendar if needed.</p>}
    >
      {client && (
        <p className="text-sm">
          For <strong>{fullName(client.firstName, client.lastName)}</strong>
          {fav && (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => {
                setCriteria((c) => ({ ...c, weekdays: fav.weekdays, block: fav.block }));
                if (fav.serviceIds.length) setServiceIds(fav.serviceIds.filter((id) => data.services.some((s) => s.id === id)));
              }}
            >
              Use their favorites
            </button>
          )}
        </p>
      )}

      <section>
        <h3 className="mb-1.5 text-sm font-semibold">Services</h3>
        <div className="space-y-2">
          {groups.map(([cat, list]) => (
            <div key={cat} className="flex flex-wrap gap-1.5">
              {list.map((s) => {
                const on = serviceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setServiceIds((ids) => (on ? ids.filter((x) => x !== s.id) : [...ids, s.id]))}
                    className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line"}`}
                  >
                    {s.name} <span className={on ? "" : "text-muted"}>{money(s.price_cents)}{s.price_type === "starting_at" ? "+" : ""}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {start.rebook && <p className="rounded-lg bg-background px-3 py-2 text-sm">Tap <strong>2, 4, 6 or 8 weeks</strong> to see openings around that date.</p>}
      <SearchControls criteria={criteria} onChange={setCriteria} openDays={openDays} zone={zone} />

      <section aria-live="polite">
        <h3 className="mb-1.5 text-sm font-semibold">Openings</h3>
        {!serviceIds.length && <p className="text-sm text-muted">Pick a service to see openings.</p>}
        {loading && <p className="text-sm text-muted">Searching…</p>}
        {error && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
        {!loading && results && results.length === 0 && <p className="text-sm text-muted">No openings match. Try more days or a wider time.</p>}
        {!loading && byDate.length > 0 && (
          <ul className="space-y-3">
            {byDate.map(([date, list]) => (
              <li key={date}>
                <p className="text-sm font-semibold">{formatDay(date, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {list.map((o) => (
                    <button
                      key={o.minutes}
                      type="button"
                      onClick={() => onPick({ date: o.date, time: toHHMM(o.minutes), serviceIds, clientId: client?.id ?? null })}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold hover:border-accent"
                    >
                      {formatSlot(o.date, o.minutes, data.timezone)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Sheet>
  );
}
