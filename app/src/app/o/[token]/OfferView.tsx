"use client";

import { useState, useTransition } from "react";
import type { Choice } from "@/lib/sick/server";
import type { SickOptionKey } from "@/lib/sick/rules";
import { cancelVisit, pickTime } from "./actions";

const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

/** The client's choices: same stylist later, or (if the salon allows) someone else; then confirm. */
export default function OfferView({ token, sickName, settings, choices, phone }: { token: string; sickName: string; settings: { substitutes: boolean }; choices: Record<SickOptionKey, Choice[]>; phone: string | null }) {
  const [picked, setPicked] = useState<Choice | null>(null);
  const [done, setDone] = useState<{ text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div role="status" className="mt-6 rounded-2xl border border-line bg-surface p-5 text-center">
        <p className="font-display text-2xl">All set</p>
        <p className="mt-2 text-muted">{done.text}</p>
      </div>
    );
  }

  const sameDay = [...choices.sameWindowOther, ...choices.sameDayOther].sort((x, y) => x.start.localeCompare(y.start));
  const groups: { key: string; title: string; hint?: string; list: Choice[] }[] = [
    { key: "own", title: `With ${sickName}, when they're back`, list: choices.otherDaySame },
    ...(settings.substitutes ? [{ key: "same", title: "Someone else, the same day", hint: "Another stylist at the salon who does these services", list: sameDay }, { key: "other", title: "Someone else, another day", list: choices.otherDayOther }] : []),
  ];
  const none = groups.every((g) => !g.list.length);

  return (
    <div className="mt-6 space-y-5">
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}

      {picked ? (
        <div className="space-y-3 rounded-2xl border border-accent bg-surface p-5">
          <p className="text-sm text-muted">Your new time</p>
          <p className="font-display text-2xl">{picked.label}</p>
          <p>with {picked.staffName}</p>
          <p className="text-lg">
            {picked.total < picked.was && <span className="mr-2 text-muted line-through">{money(picked.was)}</span>}
            <span className="font-semibold">{money(picked.total)}</span>
            {picked.badge && <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold">{picked.badge}</span>}
          </p>
          <p className="text-xs text-muted">Any deposit you paid moves with your appointment.</p>
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-full bg-accent px-4 py-3 font-semibold text-on-accent disabled:opacity-50"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await pickTime(token, picked.staffId, picked.start);
                  if (r.ok) setDone({ text: `Your appointment is now ${r.when} with ${r.stylist}${r.discount ? `, ${money(r.total)} after ${money(r.discount)} off` : ""}. You'll get a confirmation.` });
                  else {
                    setError(r.error);
                    setPicked(null);
                  }
                })
              }
            >
              {pending ? "Booking…" : "Confirm"}
            </button>
            <button className="rounded-full border border-line px-4 py-3" disabled={pending} onClick={() => setPicked(null)}>Back</button>
          </div>
        </div>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.key} className="space-y-2">
              <h2 className="font-semibold">{g.title}</h2>
              {g.hint && <p className="-mt-1 text-xs text-muted">{g.hint}</p>}
              {g.list.length ? (
                <ul className="grid gap-2">
                  {g.list.map((c) => (
                    <li key={`${c.staffId}-${c.start}`}>
                      <button onClick={() => setPicked(c)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left hover:border-accent">
                        <span>
                          <span className="block font-medium">{c.label}</span>
                          <span className="text-sm text-muted">with {c.staffName}</span>
                        </span>
                        <span className="shrink-0 text-right text-sm">
                          {c.badge && <span className="block rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold">{c.badge}</span>}
                          <span className="block">{c.total < c.was && <span className="mr-1 text-muted line-through">{money(c.was)}</span>}{money(c.total)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">No open times here right now.</p>
              )}
            </section>
          ))}
          {none && phone && <a href={`tel:${phone}`} className="block rounded-full border border-line px-4 py-3 text-center">Call the salon</a>}
          <section className="border-t border-line pt-4 text-center">
            <button
              className="text-sm text-muted underline"
              disabled={pending}
              onClick={() =>
                confirm("Cancel your appointment? There's no fee.") &&
                start(async () => {
                  const r = await cancelVisit(token);
                  if (r.ok) setDone({ text: "Your appointment is cancelled, with no fee. If you paid a deposit, the salon will refund it." });
                  else setError(r.error);
                })
              }
            >
              I&rsquo;d rather cancel (no fee)
            </button>
          </section>
        </>
      )}
    </div>
  );
}
