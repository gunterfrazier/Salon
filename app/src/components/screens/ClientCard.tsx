"use client";

import { useState, useTransition } from "react";

export interface CardData {
  name: string;
  phone: string | null;
  notes: string | null;
  lastVisit: string | null;
  formulas: { date: string; text: string; developer: string | null; minutes: number | null; notes: string | null }[];
}

/** Server actions the client-card slide calls (signed-in staff screens only). */
export interface ClientCardApi {
  search: (q: string) => Promise<{ id: string; name: string; phone: string | null }[]>;
  card: (id: string) => Promise<CardData | null>;
}

/** Touch lookup: find a client, see their formulas and notes. Pauses the playlist while in use. */
export default function ClientCard({ api, onBusy }: { api: ClientCardApi; onBusy: (busy: boolean) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [card, setCard] = useState<CardData | null>(null);
  const [pending, start] = useTransition();

  const find = (v: string) => {
    setQ(v);
    onBusy(true);
    if (v.trim().length < 2) return setHits([]);
    start(async () => setHits(await api.search(v.trim())));
  };
  const open = (id: string) => start(async () => setCard(await api.card(id)));
  const reset = () => {
    setCard(null);
    setHits([]);
    setQ("");
    onBusy(false);
  };

  if (card) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-4xl">{card.name}</h2>
          <button onClick={reset} className="rounded-full border border-line px-4 py-2 text-lg">Done</button>
        </div>
        <p className="text-lg text-muted">{[card.phone, card.lastVisit ? `Last visit ${card.lastVisit}` : null].filter(Boolean).join(" · ")}</p>
        {card.notes && <p className="rounded-xl border border-line p-3 text-lg">Notes: {card.notes}</p>}
        <h3 className="text-xl font-semibold">Color formulas</h3>
        {card.formulas.length ? (
          <ul className="space-y-3">
            {card.formulas.map((f, i) => (
              <li key={i} className="rounded-xl border border-line p-4">
                <p className="text-sm text-muted">{f.date}</p>
                <p className="whitespace-pre-line font-mono text-xl">{f.text}</p>
                <p className="mt-1 text-lg text-muted">{[f.developer && `Developer: ${f.developer}`, f.minutes && `${f.minutes} min`].filter(Boolean).join(" · ")}</p>
                {f.notes && <p className="mt-1 text-lg">{f.notes}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg text-muted">No formulas saved yet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h2 className="font-display text-4xl">Client card</h2>
      <p className="text-lg text-muted">Look up a client&rsquo;s formulas and notes.</p>
      <input value={q} onChange={(e) => find(e.target.value)} onBlur={() => !q && onBusy(false)} placeholder="Type a name or phone" aria-label="Find a client" className="mt-4 w-full rounded-2xl border border-line bg-background px-5 py-4 text-2xl" />
      <ul className="mt-3 divide-y divide-line">
        {hits.map((h) => (
          <li key={h.id}>
            <button onClick={() => open(h.id)} className="flex w-full justify-between gap-3 py-4 text-left text-2xl">
              <span>{h.name}</span>
              <span className="text-lg text-muted">{h.phone ?? ""}</span>
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && !pending && !hits.length && <li className="py-4 text-lg text-muted">No matches.</li>}
      </ul>
    </div>
  );
}
