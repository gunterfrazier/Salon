"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { WalkinSettings } from "@/lib/walkins/engine";
import type { LineView } from "@/lib/walkins/server";
import { addWalkin, leaveLine, saveWalkinSettings, startWalk } from "./actions";

type View = Omit<LineView, "prediction"> & { prediction?: undefined };
type Result = { ok: true; text: string } | { ok: false; error: string };

const input = "w-full rounded-lg border border-line bg-background px-3 py-2 text-base";
const btn = "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50";

export default function WalkinsView({ view, menu, team, canSetUp }: { view: View; menu: { id: string; name: string }[]; team: { id: string; name: string; commission: boolean }[]; canSetUp: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", phone: "", serviceIds: [] as string[], requested: "" });
  const [pickFor, setPickFor] = useState<Record<string, string>>({});
  const [showSetup, setShowSetup] = useState(view.settings.mode === "off");

  // Keep waits current.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.error });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  const off = view.settings.mode === "off";

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Walk-ins</h1>
          <p className="text-sm text-muted">{off ? "Walk-ins are off." : `${view.waiting.length} waiting · ${view.inChair.length} in the chair. Waits are estimates and update every 30 seconds.`}</p>
        </div>
        {canSetUp && <button className={btn} onClick={() => setShowSetup((v) => !v)}>{showSetup ? "Hide settings" : "Walk-in settings"}</button>}
      </header>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-line bg-surface" : "border-red-300 bg-red-50 font-semibold text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"}`}>{msg.text}</p>}

      {showSetup && canSetUp && <WalkinSetup initial={view.settings} team={team} onSaved={(t) => { setMsg({ ok: true, text: t }); router.refresh(); }} />}

      {!off && (
        <>
          <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <div className="rounded-xl border border-accent bg-accent/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Anyone</p>
              <p className="text-lg font-semibold">{view.anyone.wait}</p>
              {view.anyone.staffName && <p className="text-xs text-muted">likely {view.anyone.staffName}</p>}
            </div>
            {view.stylists.map((s) => (
              <div key={s.id} className="rounded-xl border border-line bg-surface p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.name.split(" ")[0]}{!s.inRotation ? " · requests only" : ""}</p>
                <p className="text-lg font-semibold">{s.wait}</p>
                <p className="text-xs text-muted">{s.busyNow ? "With a client" : "Free now"} · {s.turns % 1 ? s.turns.toFixed(1) : s.turns} turn{s.turns === 1 ? "" : "s"}</p>
              </div>
            ))}
          </section>

          <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
            <h2 className="font-semibold">Add a walk-in</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <input className={input} placeholder="Name" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={input} placeholder="Mobile (optional)" aria-label="Mobile" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <select className={input} aria-label="Stylist" value={form.requested} onChange={(e) => setForm({ ...form, requested: e.target.value })}>
                <option value="">Anyone (next up)</option>
                {team.map((t) => <option key={t.id} value={t.id}>Asked for {t.name.split(" ")[0]}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {menu.map((s) => {
                const on = form.serviceIds.includes(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on} onClick={() => setForm({ ...form, serviceIds: on ? form.serviceIds.filter((x) => x !== s.id) : [...form.serviceIds, s.id] })} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line"}`}>
                    {s.name}
                  </button>
                );
              })}
            </div>
            <button className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50" disabled={pending || !form.name.trim()} onClick={() => run(() => addWalkin({ ...form, requested: form.requested || null }), () => setForm({ name: "", phone: "", serviceIds: [], requested: "" }))}>
              Add to the line
            </button>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">Waiting ({view.waiting.length})</h2>
            {view.waiting.length ? (
              <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
                {view.waiting.map((w, i) => (
                  <li key={w.id} className="flex flex-wrap items-center gap-2 px-3 py-3">
                    <span className="w-6 text-center font-mono text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] sm:basis-0">
                      <span className="block font-medium">{w.name}{w.source !== "desk" && <span className="ml-2 text-xs text-muted">{w.source === "online" ? "joined online" : "checked in"}</span>}</span>
                      <span className="block text-xs text-muted">
                        {w.services.length ? w.services.join(" + ") : "Service not picked"} · {w.requestedName ? `asked for ${w.requestedName}` : w.staffName ? `likely ${w.staffName}` : "no one free today"} · {w.wait}
                      </span>
                    </span>
                    <span className="w-6 sm:hidden" aria-hidden="true" />
                    <select className="rounded-lg border border-line bg-background px-2 py-1.5 text-sm" aria-label={`Who takes ${w.name}`} value={pickFor[w.id] ?? w.staffId ?? ""} onChange={(e) => setPickFor({ ...pickFor, [w.id]: e.target.value })}>
                      <option value="">Pick…</option>
                      {team.map((t) => <option key={t.id} value={t.id}>{t.name.split(" ")[0]}</option>)}
                    </select>
                    <button className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-semibold text-background disabled:opacity-50" disabled={pending || !(pickFor[w.id] ?? w.staffId)} onClick={() => run(() => startWalk(w.id, pickFor[w.id] ?? w.staffId))}>
                      Start
                    </button>
                    <button className={btn} disabled={pending} onClick={() => confirm(`Take ${w.name} off the line?`) && run(() => leaveLine(w.id, "left"))}>Left</button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">No one waiting.</p>
            )}
          </section>

          {view.inChair.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold">In the chair</h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {view.inChair.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>{w.name}<span className="block text-xs text-muted">with {w.staffName ?? "—"} since {new Date(w.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span></span>
                    <Link className={btn} href="/app/today">Check out in Today</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

const METHODS: [WalkinSettings["method"], string, string][] = [
  ["soonest", "Whoever is free first", "The stylist who can start soonest."],
  ["fixed", "In a set order", "First on your list who's free; if they're busy, the next on the list."],
  ["rotation", "Take turns", "Fewest turns goes next; ties go by your list. Resets when you choose."],
  ["balanced", "Even it out", "Fewest turns goes next, even if they're free a few minutes later, so everyone gets about the same."],
];

/** The salon's walk-in rules (shown to people who edit policies). */
function WalkinSetup({ initial, team, onSaved }: { initial: WalkinSettings; team: { id: string; name: string; commission: boolean }[]; onSaved: (text: string) => void }) {
  const [s, setS] = useState<WalkinSettings>({ ...initial, order: initial.order.length ? initial.order.filter((id) => team.some((t) => t.id === id)).concat(team.map((t) => t.id).filter((id) => !initial.order.includes(id))) : team.map((t) => t.id) });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const move = (i: number, d: -1 | 1) => {
    const o = [...s.order];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setS({ ...s, order: o });
  };
  const name = (id: string) => team.find((t) => t.id === id)?.name ?? "—";
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Walk-in settings</h2>
      <fieldset>
        <legend className="text-sm font-medium">Walk-ins</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {([["off", "Off"], ["both", "Alongside appointments"], ["only", "Walk-ins only"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={s.mode === k} onClick={() => setS({ ...s, mode: k })} className={`rounded-full border px-3 py-1.5 text-sm ${s.mode === k ? "border-foreground bg-foreground text-background" : "border-line"}`}>{l}</button>
          ))}
        </div>
        {s.mode === "only" && <p className="mt-1 text-xs text-muted">Your salon page shows the line and wait times instead of online booking.</p>}
      </fieldset>
      {s.mode !== "off" && (
        <>
          <label className="flex items-start justify-between gap-3 text-sm">
            <span><span className="font-medium">Let people join the line online</span><span className="block text-muted">From your salon page, with their mobile number. They get a link showing their place and wait.</span></span>
            <input type="checkbox" className="mt-1 h-5 w-5" checked={s.joinOnline} onChange={(e) => setS({ ...s, joinOnline: e.target.checked })} />
          </label>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Who takes walk-ins who ask for anyone</legend>
            {([["everyone", "Everyone who takes appointments"], ["commission", "Commission stylists only"], ["list", "Only these people"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="radio" checked={s.who === k} onChange={() => setS({ ...s, who: k })} /> {l}</label>
            ))}
            {s.who === "list" && (
              <div className="ml-6 grid gap-1 sm:grid-cols-2">
                {team.map((t) => (
                  <label key={t.id} className="flex items-center gap-2"><input type="checkbox" checked={s.list.includes(t.id)} onChange={(e) => setS({ ...s, list: e.target.checked ? [...s.list, t.id] : s.list.filter((x) => x !== t.id) })} /> {t.name}</label>
                ))}
              </div>
            )}
            {s.who === "commission" && !team.some((t) => t.commission) && <p className="ml-6 text-xs text-amber-700 dark:text-amber-300">No one is set to commission yet (Pay → each person).</p>}
            <p className="text-xs text-muted">Someone who asks for a stylist always gets them.</p>
          </fieldset>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Who&rsquo;s next</legend>
            {METHODS.map(([k, l, hint]) => (
              <label key={k} className="flex items-start gap-2"><input type="radio" className="mt-1" checked={s.method === k} onChange={() => setS({ ...s, method: k })} /> <span>{l}<span className="block text-xs text-muted">{hint}</span></span></label>
            ))}
          </fieldset>
          {(s.method === "fixed" || s.method === "rotation") && (
            <div className="text-sm">
              <p className="font-medium">{s.method === "fixed" ? "Order (first gets the next walk-in when free)" : "Order (breaks ties)"}</p>
              <ol className="mt-1 space-y-1">
                {s.order.map((id, i) => (
                  <li key={id} className="flex items-center gap-2">
                    <span className="w-5 text-muted">{i + 1}.</span>
                    <span className="flex-1">{name(id)}</span>
                    <button className={btn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${name(id)} up`}>↑</button>
                    <button className={btn} onClick={() => move(i, 1)} disabled={i === s.order.length - 1} aria-label={`Move ${name(id)} down`}>↓</button>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {(s.method === "rotation" || s.method === "balanced") && (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <label className="block">
                Turns start over
                <select className={`${input} mt-1`} value={s.reset} onChange={(e) => setS({ ...s, reset: e.target.value as WalkinSettings["reset"] })}>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week (Sunday)</option>
                  <option value="never">Never (carry on)</option>
                </select>
              </label>
              <label className="block">
                A walk-in counts as
                <select className={`${input} mt-1`} value={s.turns} onChange={(e) => setS({ ...s, turns: e.target.value as WalkinSettings["turns"] })}>
                  <option value="visit">One turn each</option>
                  <option value="half_quick">Half a turn for quick services</option>
                  <option value="minutes">Its length (an hour = 1 turn)</option>
                  <option value="dollars">Its price (by dollars)</option>
                </select>
              </label>
              {s.turns === "half_quick" && (
                <label className="block">
                  &ldquo;Quick&rdquo; means up to
                  <select className={`${input} mt-1`} value={s.quickMinutes} onChange={(e) => setS({ ...s, quickMinutes: Number(e.target.value) })}>
                    {[10, 15, 20, 30, 45].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <button className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50" disabled={pending} onClick={() => start(async () => { const r = await saveWalkinSettings(s); if (r.ok) onSaved(r.text); else setError(r.error); })}>
        Save walk-in settings
      </button>
    </section>
  );
}
