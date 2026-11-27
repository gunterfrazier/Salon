"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { looksLikeTest } from "@/lib/cleanup/test-guess";
import { money } from "@/lib/format";
import { formatDay, wallParts } from "@/lib/time/zone";
import { purgeClients } from "./actions";

export type CleanupClient = { id: string; name: string; contact: string; email: string | null; source: string; created: string; booked: number; done: number; paid: number };

const input = "w-full rounded-xl border border-line bg-background px-3 py-2.5 text-base";

/** Pick practice clients and remove them, with their bookings and payments, for good. */
export default function CleanupView({ clients, tz }: { clients: CleanupClient[]; tz: string }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const likely = useMemo(() => clients.filter((c) => looksLikeTest(c)).map((c) => c.id), [clients]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? clients.filter((c) => `${c.name} ${c.contact} ${c.email ?? ""}`.toLowerCase().includes(t)) : clients;
  }, [clients, q]);
  const chosen = clients.filter((c) => picked.has(c.id));
  const totals = chosen.reduce((s, c) => ({ booked: s.booked + c.booked, done: s.done + c.done, paid: s.paid + c.paid }), { booked: 0, done: 0, paid: 0 });

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  function remove() {
    start(async () => {
      const r = await purgeClients([...picked], confirm);
      if (!r.ok) return setMsg(r.error);
      setMsg(`Removed ${r.clients} client${r.clients === 1 ? "" : "s"} and ${r.appointments} appointment${r.appointments === 1 ? "" : "s"}.`);
      setPicked(new Set());
      setConfirm("");
    });
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 pb-40">
      <header>
        <Link href="/app/clients" className="text-sm text-muted">‹ Clients</Link>
        <h1 className="font-display text-3xl">Clean up test data</h1>
        <p className="text-sm text-muted">Made some practice clients and bookings while trying things out? Pick them here and remove them, along with their appointments, payments and messages. Reports and the calendar update right away. This can&rsquo;t be undone.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <input className={`${input} basis-full`} placeholder="Search name, phone or email" aria-label="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
        {likely.length > 0 && (
          <button className="rounded-full border border-line px-4 py-2 text-sm" onClick={() => setPicked(new Set([...picked, ...likely]))}>
            Select {likely.length} likely test client{likely.length === 1 ? "" : "s"}
          </button>
        )}
        {picked.size > 0 && <button className="rounded-full px-4 py-2 text-sm text-muted" onClick={() => setPicked(new Set())}>Clear</button>}
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {shown.slice(0, 300).map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
              <input type="checkbox" className="mt-1 size-5 accent-[var(--accent)]" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{c.name || "No name"}</span>
                  {looksLikeTest(c) && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">looks like a test</span>}
                </span>
                <span className="block truncate text-sm text-muted">{c.contact || "No contact info"} · added {formatDay(wallParts(new Date(c.created), tz).date, { month: "short", day: "numeric", year: "numeric" })}</span>
                <span className="block text-xs text-muted">
                  {c.booked} booking{c.booked === 1 ? "" : "s"}{c.done ? `, ${c.done} completed` : ""}{c.paid ? ` · ${money(c.paid)} paid` : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No clients match.</li>}
      </ul>
      {shown.length > 300 && <p className="text-xs text-muted">Showing the newest 300. Search to find others.</p>}
      {msg && <p role="status" className="rounded-xl border border-line bg-surface p-3 text-sm">{msg}</p>}

      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-4 shadow-2xl [body:has(.tabbar)_&]:bottom-16">
          <div className="mx-auto max-w-3xl space-y-2">
            <p className="text-sm">
              <strong>{picked.size} client{picked.size === 1 ? "" : "s"}</strong> selected: {totals.booked} booking{totals.booked === 1 ? "" : "s"}
              {totals.paid ? <> and <strong>{money(totals.paid)}</strong> in payments</> : null} will be removed.
              {totals.done > 0 && <span className="text-amber-700 dark:text-amber-300"> {totals.done} completed visit{totals.done === 1 ? "" : "s"} included: make sure these aren&rsquo;t real clients.</span>}
            </p>
            <div className="flex gap-2">
              <input className={`${input} flex-1`} placeholder="Type DELETE to confirm" aria-label="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" />
              <button disabled={pending || confirm.trim().toUpperCase() !== "DELETE"} onClick={remove} className="rounded-full bg-red-700 px-5 py-2.5 font-semibold text-white disabled:opacity-40">
                {pending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
