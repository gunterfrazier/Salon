"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { StatusChip } from "@/components/StatusChip";
import type { ClientProfileData } from "@/lib/clients/profile-types";
import { reviveClientState } from "@/lib/data/clients-shared";
import { fullName, money } from "@/lib/format";
import { formatDateTime, zoneLabel } from "@/lib/time/zone";
import { clientChips } from "@/lib/ui/standing";
import { shrinkImage } from "@/lib/ui/resize";
import { addFormula, deleteFormula, markRefundReturned, saveFavorites, setDepositRule, settleBalance, updateClientRecord, updateFlag } from "../actions";
import { TIME_BLOCKS, type Favorites, type TimeBlock } from "@/lib/booking/search";

const input = "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base";
const card = "rounded-xl border border-line bg-surface p-4";
const btn = "rounded-lg border border-line px-3 py-2 text-sm";
const primary = "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-40";
const STATUS: Record<string, string> = {
  completed: "Completed", no_show: "No-show", cancelled: "Cancelled", booked: "Booked", confirmed: "Confirmed", pending: "Pending",
  checked_in: "Checked in", in_service: "In service",
};

/** Runs a server action, shows its error, refreshes on success. */
function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        after?.();
        router.refresh();
      } else setError(r.error ?? "Something went wrong.");
    });
  };
  return { run, pending, error };
}

const Err = ({ msg }: { msg: string | null }) => (msg ? <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">{msg}</p> : null);

export default function ClientProfile({ data }: { data: ClientProfileData }) {
  const { client, timezone: tz } = data;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
  }, []);
  const state = reviveClientState(data.state);
  const { chips, standing } = clientChips(state, data.policy, now ?? new Date(0));
  const date: DateFn = (iso, opts) => formatDateTime(new Date(iso), tz, opts);
  const openBalances = data.balances.filter((b) => !b.settled);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div>
        <Link href="/clients" className="text-sm text-muted hover:underline">‹ Clients</Link>
        <h1 className="mt-1 text-2xl font-bold">{fullName(client.firstName, client.lastName)}</h1>
        <p className="text-sm text-muted">
          {client.phone && <a href={`tel:${client.phone}`} className="underline">{client.phone}</a>}
          {client.phone && client.email && " · "}
          {client.email && <a href={`mailto:${client.email}`} className="underline">{client.email}</a>}
        </p>
        <p className="text-sm text-muted">
          {state.onTimeVisits.length + state.priorVisitCount} visits{state.priorVisitCount ? ` (${state.priorVisitCount} before Chairvana)` : ""} · client since {date(client.createdAt)}
        </p>
        {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((c, i) => <StatusChip key={i} status={c.status} text={c.text} />)}</div>}
        <p className="mt-1 text-xs text-muted">Times in {zoneLabel(tz)}</p>
      </div>

      {(openBalances.length > 0 || data.refundsOwed.length > 0) && <Money data={data} date={date} />}
      <Contact data={data} />
      <FavoritesCard data={data} />
      <DepositRule data={data} />
      {standing.history.length > 0 && <Flags data={data} history={standing.history} date={date} />}
      <Formulas data={data} date={date} />
      <Visits data={data} date={date} />
    </main>
  );
}

type DateFn = (iso: string, opts?: { weekday?: boolean }) => string;

function Money({ data, date }: { data: ClientProfileData; date: DateFn }) {
  const { run, pending, error } = useAction();
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const open = data.balances.filter((b) => !b.settled);
  return (
    <section className={`${card} border-2`} style={{ borderColor: "var(--accent)" }}>
      <h2 className="font-semibold">Money</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={input} aria-label="Payment method">
          {data.paymentMethods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <input value={reference} onChange={(e) => setReference(e.target.value)} className={input} placeholder="Reference (optional)" aria-label="Reference" />
      </div>
      <ul className="mt-3 divide-y divide-line text-sm">
        {open.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span><span className="font-semibold">Owes {money(b.amount)}</span> · {b.reason} · {date(b.createdAt)}</span>
            <button disabled={pending} className={primary} onClick={() => run(() => settleBalance(data.client.id, b.id, method, reference), () => setReference(""))}>Mark paid</button>
          </li>
        ))}
        {data.refundsOwed.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span><span className="font-semibold">Return {money(r.amount)}</span> to client · {r.note ?? "Refund"} · {date(r.createdAt)}</span>
            <button disabled={pending} className={btn} onClick={() => run(() => markRefundReturned(data.client.id, r.id, method, reference), () => setReference(""))}>Mark returned</button>
          </li>
        ))}
      </ul>
      <Err msg={error} />
    </section>
  );
}

function Contact({ data }: { data: ClientProfileData }) {
  const c = data.client;
  const { run, pending, error } = useAction();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ firstName: c.firstName, lastName: c.lastName ?? "", phone: c.phone ?? "", email: c.email ?? "", notes: c.notes ?? "", priorVisitCount: String(c.priorVisitCount), smsOptIn: c.smsOptIn });
  if (!editing) {
    return (
      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Notes</h2>
          <button className={btn} onClick={() => setEditing(true)}>Edit details</button>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm">{c.notes || <span className="text-muted">No notes yet.</span>}</p>
      </section>
    );
  }
  return (
    <section className={card}>
      <h2 className="font-semibold">Edit details</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input className={input} aria-label="First name" placeholder="First name *" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
        <input className={input} aria-label="Last name" placeholder="Last name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        <input className={input} aria-label="Phone" placeholder="Mobile phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input className={input} aria-label="Email" placeholder="Email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </div>
      <textarea className={`${input} mt-2`} rows={3} aria-label="Notes" placeholder="Notes (preferences, allergies, hair history…)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      <label className="mt-2 flex items-center gap-2 text-sm">
        Visits before Chairvana
        <input type="number" min={0} className="w-24 rounded-lg border border-line bg-background px-2 py-1.5" value={f.priorVisitCount} onChange={(e) => setF({ ...f, priorVisitCount: e.target.value })} aria-label="Visits before Chairvana" />
        <span className="text-xs text-muted">(regulars aren&rsquo;t treated as new clients)</span>
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={f.smsOptIn} onChange={(e) => setF({ ...f, smsOptIn: e.target.checked })} />
        OK to text (the client agreed to get appointment texts)
      </label>
      <Err msg={error} />
      <div className="mt-3 flex justify-end gap-2">
        <button className="rounded-lg px-4 py-2.5 text-sm" onClick={() => setEditing(false)}>Cancel</button>
        <button
          className={primary}
          disabled={pending}
          onClick={() => run(() => updateClientRecord(c.id, { ...f, priorVisitCount: Number(f.priorVisitCount || 0) }), () => setEditing(false))}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

function DepositRule({ data }: { data: ClientProfileData }) {
  const c = data.client;
  const { run, pending, error } = useAction();
  const [kind, setKind] = useState(c.depositOverride);
  const [amount, setAmount] = useState(c.depositOverrideCents ? (c.depositOverrideCents / 100).toFixed(2) : "");
  const changed = kind !== c.depositOverride || (kind === "amount" && Math.round(Number(amount) * 100) !== c.depositOverrideCents);
  return (
    <section className={card}>
      <h2 className="font-semibold">Deposit rule for this client</h2>
      <p className="text-sm text-muted">On top of your salon policy (new clients, flags). The higher amount wins, never more than the booking total.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {([["none", "Salon policy only"], ["amount", "Always a set amount"], ["full", "Always pay in full"]] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="radio" name="deposit" checked={kind === k} onChange={() => setKind(k)} className="size-4 accent-[var(--accent)]" />
            {label}
          </label>
        ))}
        {kind === "amount" && (
          <span className="flex items-center gap-1">$<input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-24 rounded-lg border border-line bg-background px-2 py-1.5" aria-label="Deposit amount" /></span>
        )}
      </div>
      <Err msg={error} />
      {changed && (
        <div className="mt-3 flex justify-end">
          <button
            className={primary}
            disabled={pending}
            onClick={() => run(() => setDepositRule(c.id, kind === "amount" ? { kind, cents: Math.round(Number(amount) * 100) } : { kind }))}
          >
            Save deposit rule
          </button>
        </div>
      )}
    </section>
  );
}

function Flags({ data, history, date }: { data: ClientProfileData; history: ReturnType<typeof clientChips>["standing"]["history"]; date: DateFn }) {
  const { run, pending, error } = useAction();
  const [clearing, setClearing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const p = data.policy.flags;
  return (
    <section className={card}>
      <h2 className="font-semibold">Violations</h2>
      <p className="text-sm text-muted">Kept permanently. Active flags clear after {p.clearAfterOnTimeVisits ?? "—"} on-time visits unless made permanent.</p>
      <ul className="mt-3 space-y-2">
        {history.map((h) => {
          const extra = data.flagNotes[h.flag.id];
          return (
            <li key={h.flag.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    size="sm"
                    status={h.state === "permanent" ? "permanent_flag" : h.state === "active" ? (h.flag.type === "no_show" ? "no_show" : "late_cancel") : "past_violation"}
                    text={h.flag.type === "no_show" ? "No-show" : "Late cancel"}
                  />
                  {date(h.flag.appointmentStart.toISOString())}
                  {h.flag.feeCharged ? ` · ${money(h.flag.feeCharged)} fee` : ""}
                </span>
                <span className="text-muted">
                  {h.state === "permanent" ? "Permanent" : h.state === "active" ? `Active · ${h.visitsRemaining ?? "?"} visits to clear` : h.resolvedBy === "stylist" ? "Cleared by you" : "Cleared by on-time visits"}
                </span>
              </div>
              {extra?.clearNote && <p className="mt-1 text-muted">Note: {extra.clearNote}</p>}
              {h.state !== "resolved" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {h.state === "active" && p.stylistCanMakePermanent && (
                    <button disabled={pending} className={btn} onClick={() => run(() => updateFlag(data.client.id, h.flag.id, "permanent"))}>Make permanent</button>
                  )}
                  {h.state === "permanent" && (
                    <button disabled={pending} className={btn} onClick={() => run(() => updateFlag(data.client.id, h.flag.id, "unpermanent"))}>Remove permanent</button>
                  )}
                  {p.stylistCanClearManually && clearing !== h.flag.id && (
                    <button disabled={pending} className={btn} onClick={() => { setClearing(h.flag.id); setNote(""); }}>Clear flag…</button>
                  )}
                </div>
              )}
              {clearing === h.flag.id && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input className={`${input} flex-1`} placeholder="Why it's cleared (required)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Reason for clearing" />
                  <button disabled={pending || !note.trim()} className={primary} onClick={() => run(() => updateFlag(data.client.id, h.flag.id, "clear", note), () => setClearing(null))}>Clear</button>
                  <button className="px-3 text-sm" onClick={() => setClearing(null)}>Cancel</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Err msg={error} />
    </section>
  );
}

function Formulas({ data, date }: { data: ClientProfileData; date: DateFn }) {
  const { run, pending, error } = useAction();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ formula: "", developer: "", processing: "", notes: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const shrunk = await Promise.all(files.map((x) => shrinkImage(x)));
      const form = new FormData();
      Object.entries(f).forEach(([k, v]) => form.set(k, v));
      shrunk.forEach((x) => form.append("photos", x));
      run(() => addFormula(data.client.id, form), () => {
        setAdding(false);
        setF({ formula: "", developer: "", processing: "", notes: "" });
        setFiles([]);
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Color formulas</h2>
        {!adding && <button className={btn} onClick={() => setAdding(true)}>+ Add formula</button>}
      </div>
      {adding && (
        <div className="mt-3 space-y-2 rounded-lg bg-background p-3">
          <textarea className={input} rows={2} placeholder="Formula, e.g. 6N + 7G 1:1, roots; 8N glaze ends *" aria-label="Formula" value={f.formula} onChange={(e) => setF({ ...f, formula: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={input} placeholder="Developer, e.g. 20 vol" aria-label="Developer" value={f.developer} onChange={(e) => setF({ ...f, developer: e.target.value })} />
            <input className={input} type="number" min={0} placeholder="Processing minutes" aria-label="Processing minutes" value={f.processing} onChange={(e) => setF({ ...f, processing: e.target.value })} />
          </div>
          <textarea className={input} rows={2} placeholder="Notes (result, what to change next time)" aria-label="Formula notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <label className="block text-sm">
            <span className="font-semibold">Photos</span> <span className="text-muted">(before / after, up to 6)</span>
            <input type="file" accept="image/*" multiple className="mt-1 block w-full text-sm" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))} aria-label="Photos" />
          </label>
          <div className="flex justify-end gap-2">
            <button className="px-3 text-sm" onClick={() => setAdding(false)}>Cancel</button>
            <button className={primary} disabled={!f.formula.trim() || pending || busy} onClick={save}>{busy || pending ? "Saving…" : "Save formula"}</button>
          </div>
        </div>
      )}
      <Err msg={error} />
      <ul className="mt-3 space-y-3">
        {data.formulas.map((x) => (
          <li key={x.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted">{date(x.createdAt)}</span>
              <button
                className="text-xs text-muted underline"
                disabled={pending}
                onClick={() => confirm("Delete this formula and its photos?") && run(() => deleteFormula(data.client.id, x.id))}
              >
                Delete
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap font-semibold">{x.formula}</p>
            <p className="text-muted">{[x.developer, x.processingMin !== null ? `${x.processingMin} min` : null].filter(Boolean).join(" · ")}</p>
            {x.notes && <p className="mt-1 whitespace-pre-wrap">{x.notes}</p>}
            {x.photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {x.photos.map((p) =>
                  p.url ? (
                    <a key={p.path} href={p.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URLs */}
                      <img src={p.url} alt="Formula photo" className="h-24 w-24 rounded-lg object-cover" />
                    </a>
                  ) : (
                    <span key={p.path} className="flex h-24 w-24 items-center justify-center rounded-lg bg-background text-xs text-muted">Unavailable</span>
                  ),
                )}
              </div>
            )}
          </li>
        ))}
        {data.formulas.length === 0 && !adding && <li className="text-sm text-muted">No formulas yet.</li>}
      </ul>
    </section>
  );
}

function Visits({ data, date }: { data: ClientProfileData; date: DateFn }) {
  return (
    <section className={card}>
      <h2 className="font-semibold">Appointments</h2>
      <ul className="mt-2 divide-y divide-line text-sm">
        {data.visits.map((v) => (
          <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
            <span>
              <span className="font-semibold">{date(v.start, { weekday: true })}</span>
              <span className="block text-muted">{v.services.join(" + ")}</span>
              {v.cancelReason && <span className="block text-muted">{v.cancelReason}</span>}
            </span>
            <span className="text-right">
              <span className="block">{STATUS[v.status] ?? v.status}</span>
              <span className="block text-muted tabular-nums">{money(v.total)}{v.paid ? ` · paid ${money(v.paid)}` : ""}</span>
            </span>
          </li>
        ))}
        {data.visits.length === 0 && <li className="py-2 text-muted">No appointments yet.</li>}
      </ul>
    </section>
  );
}

function FavoritesCard({ data }: { data: ClientProfileData }) {
  const { run, pending, error } = useAction();
  const initial: Favorites = data.client.favorites ?? { serviceIds: [], weekdays: [], block: "any" };
  const [fav, setFav] = useState<Favorites>(initial);
  const changed = JSON.stringify(fav) !== JSON.stringify(initial);
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line"}`;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <section className={card}>
      <h2 className="font-semibold">Favorites</h2>
      <p className="text-sm text-muted">Used to pre-fill Find a time and next-visit booking.</p>
      <p className="mt-3 text-sm font-semibold">Usual services</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {data.services.map((s) => {
          const on = fav.serviceIds.includes(s.id);
          return (
            <button key={s.id} type="button" aria-pressed={on} className={chip(on)} onClick={() => setFav({ ...fav, serviceIds: on ? fav.serviceIds.filter((x) => x !== s.id) : [...fav.serviceIds, s.id] })}>
              {s.name}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm font-semibold">Favorite days</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {days.map((d, i) => {
          const on = fav.weekdays.includes(i);
          return (
            <button key={d} type="button" aria-pressed={on} className={chip(on)} onClick={() => setFav({ ...fav, weekdays: on ? fav.weekdays.filter((x) => x !== i) : [...fav.weekdays, i].sort() })}>
              {d}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm font-semibold">Time of day</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {TIME_BLOCKS.map((t) => (
          <button key={t.key} type="button" aria-pressed={fav.block === t.key} className={chip(fav.block === t.key)} onClick={() => setFav({ ...fav, block: t.key as TimeBlock })}>
            {t.label}
          </button>
        ))}
      </div>
      <Err msg={error} />
      {changed && (
        <div className="mt-3 flex justify-end">
          <button className={primary} disabled={pending} onClick={() => run(() => saveFavorites(data.client.id, fav))}>Save favorites</button>
        </div>
      )}
    </section>
  );
}
