"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { WaitlistItem } from "@/lib/data/waitlist";
import { addDays, formatDay } from "@/lib/time/zone";
import { describeWindow } from "@/lib/waitlist/match";
import { addToWaitlist, removeFromWaitlist } from "./actions";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WINDOWS: { key: string; label: string; range: [number, number] }[] = [
  { key: "any", label: "Any time", range: [0, 1440] },
  { key: "morning", label: "Mornings (before noon)", range: [0, 720] },
  { key: "afternoon", label: "Afternoons (12–5)", range: [720, 1020] },
  { key: "evening", label: "Evenings (after 5)", range: [1020, 1440] },
];
const STATUS: Record<WaitlistItem["status"], string> = { active: "Waiting", booked: "Booked", expired: "Dates passed", removed: "Removed" };

type Props = {
  items: WaitlistItem[];
  services: { id: string; name: string; category: string }[];
  stylists: { id: string; name: string }[];
  clients: { id: string; name: string; phone: string | null }[];
  today: string;
  initialClient: string | null;
};

export default function WaitlistView({ items, services, stylists, clients, today, initialClient }: Props) {
  const [adding, setAdding] = useState(!!initialClient);
  const active = items.filter((i) => i.status === "active");
  const closed = items.filter((i) => i.status !== "active");
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Waitlist</h1>
          <p className="text-sm text-muted">When a matching time opens, the client gets a text or email with a link to book it. Each person gets at most one offer a day; the first to book gets the time.</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background">
            Add someone
          </button>
        )}
      </header>

      {adding && <AddForm services={services} stylists={stylists} clients={clients} today={today} initialClient={initialClient} onClose={() => setAdding(false)} />}

      <section className="space-y-2" aria-label="Waiting">
        <h2 className="font-semibold">Waiting ({active.length})</h2>
        {!active.length && <p className="text-sm text-muted">No one is waiting. Clients can join from online booking, or add them here.</p>}
        {active.map((i) => <Entry key={i.id} i={i} />)}
      </section>

      {closed.length > 0 && (
        <details className="rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold">Closed in the last 30 days ({closed.length})</summary>
          <div className="mt-3 space-y-2">{closed.map((i) => <Entry key={i.id} i={i} />)}</div>
        </details>
      )}
    </main>
  );
}

function Entry({ i }: { i: WaitlistItem }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/app/clients/${i.clientId}`} className="font-semibold underline">{i.clientName}</Link>
        <span className="text-sm text-muted">
          {STATUS[i.status]}
          {i.source === "online" ? " · joined online" : ""}
        </span>
      </div>
      <p className="text-sm">{i.serviceNames.join(" + ")} · {i.staffName ? `with ${i.staffName}` : "anyone"}</p>
      <p className="text-sm text-muted">{describeWindow(i)}</p>
      {i.note && <p className="mt-1 text-sm">“{i.note}”</p>}
      <p className="mt-1 text-sm text-muted">
        {i.offers ? `Sent ${i.offers} offer${i.offers === 1 ? "" : "s"}, last ${new Date(i.lastOfferedAt!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No openings offered yet"}
      </p>
      {i.status === "active" && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link href={`/app/calendar?date=${i.dateFrom}`} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background">Open calendar</Link>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await removeFromWaitlist(i.id);
                if (!r.ok) setError(r.error);
              })
            }
            className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50"
          >
            {pending ? "Removing…" : "Remove"}
          </button>
          {error && <span role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</span>}
        </div>
      )}
    </article>
  );
}

function AddForm({ services, stylists, clients, today, initialClient, onClose }: Omit<Props, "items"> & { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(initialClient && clients.some((c) => c.id === initialClient) ? initialClient : null);
  const [picked, setPicked] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string>("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [win, setWin] = useState("any");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(addDays(today, 28));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    if (!q) return [];
    return clients.filter((c) => c.name.toLowerCase().includes(q) || (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits))).slice(0, 8);
  }, [query, clients]);
  const chosen = clients.find((c) => c.id === clientId);

  const save = () =>
    start(async () => {
      setError(null);
      if (!clientId) return setError("Pick a client.");
      const range = WINDOWS.find((w) => w.key === win)!.range;
      const r = await addToWaitlist({ clientId, staffId: staffId || null, serviceIds: picked, weekdays, timeFrom: range[0], timeTo: range[1], dateFrom, dateTo, note });
      if (r.ok) onClose();
      else setError(r.error);
    });

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-4" aria-label="Add to the waitlist">
      <h2 className="font-semibold">Add to the waitlist</h2>

      <div>
        <p className="text-sm font-medium">Client</p>
        {chosen ? (
          <p className="mt-1 flex items-center gap-3">
            <span className="font-semibold">{chosen.name}</span>
            <button className="text-sm underline" onClick={() => setClientId(null)}>Change</button>
          </p>
        ) : (
          <>
            <input className={`${input} mt-1`} placeholder="Search by name or phone" aria-label="Search clients" value={query} onChange={(e) => setQuery(e.target.value)} />
            {matches.length > 0 && (
              <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button className="w-full px-3 py-2.5 text-left hover:bg-background" onClick={() => setClientId(c.id)}>
                      {c.name} <span className="text-sm text-muted">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Services (online-bookable ones; the offer links to online booking)</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {services.map((s) => {
            const on = picked.includes(s.id);
            return (
              <button key={s.id} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])} className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line"}`}>
                {s.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {stylists.length > 1 && (
        <label className="block text-sm font-medium">
          With
          <select className={`${input} mt-1`} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Anyone</option>
            {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      <fieldset>
        <legend className="text-sm font-medium">Days (none picked = any day)</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {DAYS.map((d, n) => {
            const on = weekdays.includes(n);
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== n) : [...weekdays, n])} className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line"}`}>
                {d}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium">
          Times
          <select className={`${input} mt-1`} value={win} onChange={(e) => setWin(e.target.value)}>
            {WINDOWS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          From
          <input type="date" className={`${input} mt-1`} min={today} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Until
          <input type="date" className={`${input} mt-1`} min={dateFrom} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
      </div>
      <p className="text-sm text-muted">{formatDay(dateFrom)} to {formatDay(dateTo)}</p>

      <input className={input} placeholder="Note (optional), e.g. “wants an earlier color appointment”" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />

      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button disabled={saving} onClick={save} className="rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background disabled:opacity-50">{saving ? "Adding…" : "Add to waitlist"}</button>
        <button onClick={onClose} className="rounded-lg px-4 py-2.5">Cancel</button>
      </div>
    </section>
  );
}
