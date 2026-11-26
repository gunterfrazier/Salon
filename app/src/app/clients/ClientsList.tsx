"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { StatusChip } from "@/components/StatusChip";
import { filterClients, FILTERS, matchesFilter, type ClientFilter, type ClientSummary } from "@/lib/clients/summary";
import { fullName, money } from "@/lib/format";
import type { StatusKey } from "@/lib/ui/status-colors";
import { createClientRecord } from "./actions";

const input = "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base";

function chips(c: ClientSummary): { status: StatusKey; text?: string }[] {
  const out: { status: StatusKey; text?: string }[] = [];
  if (c.standing === "permanent") out.push({ status: "permanent_flag" });
  else if (c.standing === "active") out.push({ status: c.activeFlag === "no_show" ? "no_show" : "late_cancel" });
  else if (c.standing === "history") out.push({ status: "past_violation" });
  if (c.balance > 0) out.push({ status: "balance_owed", text: `Owes ${money(c.balance)}` });
  if (c.visits === 0) out.push({ status: "new_client" });
  return out;
}

export default function ClientsList({ clients, timezone }: { clients: ClientSummary[]; timezone: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [now, setNow] = useState<Date | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
  }, []);

  const shown = useMemo(() => filterClients(clients, query, filter, now ?? new Date(0)), [clients, query, filter, now]);
  const count = (f: ClientFilter) => clients.filter((c) => matchesFilter(c, f, now ?? new Date(0))).length;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" }) : "—");

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Clients <span className="text-base font-normal text-muted">({clients.length})</span></h1>
        <div className="flex gap-2">
          <Link href="/clients/import" className="rounded-lg border border-line px-3 py-2 text-sm">Import</Link>
          <button onClick={() => setAdding(true)} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent">+ Add client</button>
        </div>
      </div>

      <input className={`${input} mt-4`} placeholder="Search name, phone or email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search clients" />
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full border px-3 py-1.5 text-sm ${filter === f.key ? "border-accent bg-accent text-on-accent" : "border-line"}`}
          >
            {f.label} <span className="opacity-75">{now ? count(f.key) : ""}</span>
          </button>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
        {shown.map((c) => (
          <li key={c.id}>
            <Link href={`/clients/${c.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-background sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <span className="font-semibold">{fullName(c.firstName, c.lastName)}</span>
                <span className="block text-sm text-muted">{[c.phone, c.email].filter(Boolean).join(" · ") || "No contact info"}</span>
                {chips(c).length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">{chips(c).map((x, i) => <StatusChip key={i} status={x.status} text={x.text} size="sm" />)}</span>
                )}
              </span>
              <span className="shrink-0 text-sm text-muted sm:text-right">
                Last visit {date(c.lastVisit)}
                {c.nextVisit && <span className="block">Next {date(c.nextVisit)}</span>}
              </span>
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-6 text-center text-muted">{clients.length ? "No clients match." : "No clients yet. Add one, or import your StyleSeat list."}</li>}
      </ul>

      {adding && <AddClient onClose={() => setAdding(false)} onSaved={(id) => router.push(`/clients/${id}`)} />}
    </main>
  );
}

function AddClient({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", email: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await createClientRecord(f);
      if (r.ok) onSaved(r.id);
      else setError(r.error);
    });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add client" className="w-full max-w-md rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Add client</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className={input} placeholder="First name *" aria-label="First name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
          <input className={input} placeholder="Last name" aria-label="Last name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
          <input className={input} placeholder="Mobile phone" aria-label="Phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input className={input} placeholder="Email" aria-label="Email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <textarea className={`${input} mt-2`} rows={2} placeholder="Notes" aria-label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2.5">Cancel</button>
          <button onClick={save} disabled={saving || !f.firstName.trim()} className="rounded-lg bg-accent px-4 py-2.5 font-semibold text-on-accent disabled:opacity-40">{saving ? "Saving…" : "Add client"}</button>
        </div>
      </div>
    </div>
  );
}
