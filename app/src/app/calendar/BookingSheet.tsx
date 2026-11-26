"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { StatusChip } from "@/components/StatusChip";
import { buildBooking, toBookable } from "@/lib/booking/build";
import type { CalendarData } from "@/lib/data/calendar-types";
import { reviveClientState, type ClientStateJSON } from "@/lib/data/clients-shared";
import { duration, fullName, money } from "@/lib/format";
import { suggestOrder } from "@/lib/schedule/plan";
import { formatDay, formatMinutes, formatTime, isDateStr, parseHHMM, weekday, WEEKDAY_KEYS, zonedToUtc } from "@/lib/time/zone";
import { clientChips, NEW_CLIENT_STATE } from "@/lib/ui/standing";
import { createAppointment, fetchClientState } from "./actions";

const input = "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base";
const label = "block text-sm font-semibold";

export default function BookingSheet({
  data, initialDate, initialTime, onClose, onSaved,
}: {
  data: CalendarData; initialDate: string; initialTime: string; onClose: () => void; onSaved: () => void;
}) {
  const tz = data.timezone;
  const [mode, setMode] = useState<"existing" | "new">(data.clients.length ? "existing" : "new");
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientState, setClientState] = useState<ClientStateJSON | null>(null);
  const [nc, setNc] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [deposit, setDeposit] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const svcById = useMemo(() => new Map(data.services.map((s) => [s.id, s])), [data.services]);
  const groups = useMemo(() => {
    const g = new Map<string, CalendarData["services"]>();
    for (const s of data.services) g.set(s.category, [...(g.get(s.category) ?? []), s]);
    return [...g.entries()];
  }, [data.services]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return data.clients
      .filter((c) => !q || fullName(c.firstName, c.lastName).toLowerCase().includes(q) || (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits)))
      .slice(0, 8);
  }, [query, data.clients]);
  const chosen = data.clients.find((c) => c.id === clientId) ?? null;

  async function pickClient(id: string) {
    setClientId(id);
    setClientState(data.clientStates[id] ?? null);
    if (!data.clientStates[id]) setClientState(await fetchClientState(id));
  }

  const state = mode === "existing" && clientState ? reviveClientState(clientState) : NEW_CLIENT_STATE;
  const minutes = /^\d{1,2}:\d{2}$/.test(time) ? parseHHMM(time) : null;

  const preview = useMemo(() => {
    if (!serviceIds.length || minutes === null || !isDateStr(date)) return null;
    const depositCents = deposit.trim() === "" ? undefined : Math.round(Number(deposit) * 100);
    try {
      return buildBooking({
        services: serviceIds.map((id) => toBookable(svcById.get(id)!)),
        start: zonedToUtc(date, minutes, tz),
        rules: data.rules,
        policy: data.policy,
        client: state,
        now: new Date(),
        depositCents: Number.isFinite(depositCents) ? depositCents : undefined,
      });
    } catch {
      return null;
    }
  }, [serviceIds, minutes, date, deposit, svcById, tz, data.rules, data.policy, state]);

  // Heads-ups (the server makes the final call on overlaps).
  const notices: string[] = [];
  if (preview && minutes !== null) {
    const hours = data.hours[WEEKDAY_KEYS[weekday(date)]];
    const endMin = minutes + preview.plan.totalMinutes;
    if (!hours) notices.push(`You're closed on ${formatDay(date, { weekday: "long" })}s.`);
    else if (minutes < parseHHMM(hours[0]) || endMin > parseHHMM(hours[1])) notices.push(`Runs outside your hours (${formatMinutes(parseHHMM(hours[0]))}–${formatMinutes(parseHHMM(hours[1]))}).`);
    const mine = preview.payload.services.flatMap((s) => s.busy);
    const clash = data.appointments.some((a) =>
      a.busy.some((b) => mine.some((m) => new Date(m.start) < new Date(b.end) && new Date(b.start) < new Date(m.end))),
    );
    if (clash) notices.push("Overlaps another appointment's hands-on time.");
  }

  const toggle = (id: string) => setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const move = (i: number, d: -1 | 1) =>
    setServiceIds((ids) => {
      const j = i + d;
      if (j < 0 || j >= ids.length) return ids;
      const next = [...ids];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const suggested = () => setServiceIds((ids) => suggestOrder(ids.map((id) => toBookable(svcById.get(id)!)), data.stages).map((s) => s.id));

  function save() {
    setError(null);
    startSaving(async () => {
      const res = await createAppointment({
        clientId: mode === "existing" ? clientId ?? undefined : undefined,
        newClient: mode === "new" ? nc : undefined,
        serviceIds,
        date,
        time,
        depositCents: preview?.deposit.required ? preview.depositCents : undefined,
        notes,
      });
      if (res.ok) onSaved();
      else setError(res.error);
    });
  }

  const canSave = !!preview && preview.errors.length === 0 && (mode === "new" ? nc.firstName.trim() !== "" : !!clientId) && !saving;
  const standingChips = mode === "existing" && clientState ? clientChips(state, data.policy, new Date()).chips : mode === "new" ? [{ status: "new_client" as const }] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-title"
        className="flex max-h-[95dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-surface sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="book-title" className="text-lg font-bold">New appointment</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl" aria-label="Close">×</button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-4">
          {/* Client */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={label}>Client</span>
              <button type="button" className="text-sm underline" onClick={() => setMode(mode === "existing" ? "new" : "existing")}>
                {mode === "existing" ? "+ New client" : "Choose existing client"}
              </button>
            </div>
            {mode === "existing" ? (
              chosen ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
                  <div>
                    <p className="font-semibold">{fullName(chosen.firstName, chosen.lastName)}</p>
                    <p className="text-sm text-muted">{chosen.phone ?? chosen.email ?? ""}</p>
                  </div>
                  <button type="button" className="text-sm underline" onClick={() => { setClientId(null); setClientState(null); }}>Change</button>
                </div>
              ) : (
                <>
                  <input className={input} placeholder="Search by name or phone" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search clients" />
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {matches.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => pickClient(c.id)} className="flex w-full justify-between gap-2 px-3 py-2.5 text-left hover:bg-background">
                          <span>{fullName(c.firstName, c.lastName)}</span>
                          <span className="text-sm text-muted">{c.phone ?? ""}</span>
                        </button>
                      </li>
                    ))}
                    {matches.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">No matches. Use “+ New client”.</li>}
                  </ul>
                </>
              )
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={input} placeholder="First name *" value={nc.firstName} onChange={(e) => setNc({ ...nc, firstName: e.target.value })} aria-label="First name" autoComplete="off" />
                <input className={input} placeholder="Last name" value={nc.lastName} onChange={(e) => setNc({ ...nc, lastName: e.target.value })} aria-label="Last name" autoComplete="off" />
                <input className={input} placeholder="Mobile phone" inputMode="tel" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} aria-label="Phone" autoComplete="off" />
                <input className={input} placeholder="Email" inputMode="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} aria-label="Email" autoComplete="off" />
              </div>
            )}
            {standingChips.length > 0 && <div className="flex flex-wrap gap-1.5">{standingChips.map((c, i) => <StatusChip key={i} status={c.status} text={"text" in c ? c.text : undefined} />)}</div>}
          </section>

          {/* Services */}
          <section className="space-y-2">
            <span className={label}>Services</span>
            {serviceIds.length > 0 && (
              <ol className="space-y-1">
                {serviceIds.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm">
                    <span className="w-5 text-muted">{i + 1}.</span>
                    <span className="flex-1">{svcById.get(id)?.name}</span>
                    <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="px-2">↑</button>
                    <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="px-2">↓</button>
                    <button type="button" aria-label="Remove" onClick={() => toggle(id)} className="px-2">×</button>
                  </li>
                ))}
                {serviceIds.length > 1 && (
                  <button type="button" onClick={suggested} className="text-sm underline">Use suggested order</button>
                )}
              </ol>
            )}
            <div className="space-y-3">
              {groups.map(([cat, list]) => (
                <div key={cat}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{cat}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {list.map((s) => {
                      const on = serviceIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(s.id)}
                          className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line"}`}
                        >
                          {s.name} <span className={on ? "" : "text-muted"}>{money(s.price_cents)}{s.price_type === "starting_at" ? "+" : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* When */}
          <section className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={label}>Date</span>
              <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className="space-y-1">
              <span className={label}>Start time</span>
              <input type="time" step={900} className={input} value={time} onChange={(e) => setTime(e.target.value)} required />
            </label>
          </section>

          {/* Preview */}
          {preview && (
            <section className="space-y-3 rounded-xl border border-line p-4">
              <p className="font-semibold">
                {formatTime(preview.plan.start, tz)} – {formatTime(preview.plan.end, tz)} · {duration(preview.plan.totalMinutes)}
              </p>
              {preview.plan.openGaps.length > 0 && (
                <p className="text-sm text-muted">
                  Open while processing: {preview.plan.openGaps.map((g) => `${formatTime(g.start, tz)}–${formatTime(g.end, tz)}`).join(", ")}
                </p>
              )}
              <ul className="divide-y divide-line text-sm">
                {preview.priced.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 py-1.5">
                    <span>
                      {l.name}
                      {l.discounts.map((d, j) => <span key={j} className="block text-xs text-muted">{d.label}: −{money(d.amount)}</span>)}
                    </span>
                    <span className="tabular-nums">
                      {l.finalPrice !== l.listPrice && <s className="mr-1 text-muted">{money(l.listPrice)}</s>}
                      {money(l.finalPrice)}
                    </span>
                  </li>
                ))}
                <li className="flex justify-between py-1.5 font-semibold">
                  <span>Estimated total</span>
                  <span className="tabular-nums">{money(preview.priced.total)}{preview.plan.priceMayVary ? "+" : ""}</span>
                </li>
              </ul>

              {preview.deposit.required && (
                <div className="space-y-1 rounded-lg bg-background p-3 text-sm">
                  <p className="font-semibold">
                    Deposit required{preview.deposit.reasons.includes("flagged_client") ? " (flagged client: full price)" : preview.deposit.reasons.includes("new_client") ? " (new client)" : ""}
                  </p>
                  <label className="flex items-center gap-2">
                    <span>$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={preview.deposit.minimum / 100}
                      max={preview.deposit.maximum / 100}
                      className={`${input} max-w-[10rem]`}
                      value={deposit === "" ? (preview.depositCents / 100).toFixed(2) : deposit}
                      onChange={(e) => setDeposit(e.target.value)}
                      aria-label="Deposit amount"
                    />
                    <span className="text-muted">{money(preview.deposit.minimum)} – {money(preview.deposit.maximum)}</span>
                  </label>
                  <p className="text-xs text-muted">Collecting deposits online comes with payments. For now it&rsquo;s recorded and shown on the calendar.</p>
                </div>
              )}

              {[...preview.plan.warnings.filter((w) => w.kind === "already_included").map((w) => w.message), ...notices].map((n) => (
                <p key={n} className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{n}</p>
              ))}
              {preview.errors.map((e) => (
                <p key={e} className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200" role="alert">{e}</p>
              ))}
            </section>
          )}

          <label className="block space-y-1">
            <span className={label}>Notes</span>
            <textarea className={input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5">Cancel</button>
            <button type="button" disabled={!canSave} onClick={save} className="rounded-lg bg-accent px-4 py-2.5 font-semibold text-on-accent disabled:opacity-40">
              {saving ? "Saving…" : "Book appointment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

