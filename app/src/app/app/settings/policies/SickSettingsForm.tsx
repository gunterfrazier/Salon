"use client";

import { useState, useTransition } from "react";
import { SICK_OPTIONS, type SickOption, type SickOptionKey, type SickSettings } from "@/lib/sick/rules";
import { saveSickSettings } from "./sick-actions";

const input = "rounded-lg border border-line bg-background px-2 py-1.5 text-base";

/** Policies → Sick days. */
export default function SickSettingsForm({ initial }: { initial: SickSettings }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const opt = (k: SickOptionKey, patch: Partial<SickOption>) => setS({ ...s, options: { ...s.options, [k]: { ...s.options[k], ...patch } } });

  return (
    <section className="mx-auto max-w-3xl space-y-4 px-4 pb-10">
      <div>
        <h2 className="text-xl font-semibold">Sick days</h2>
        <p className="text-sm text-muted">When a stylist marks themselves out sick (Out sick in the menu), each client gets a link to pick a new time. Choose what they&rsquo;re offered.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <label className="flex items-start justify-between gap-3 text-sm">
          <span><span className="font-medium">Offer other stylists</span><span className="block text-muted">Clients can move to another stylist here who does the same services and has an opening. Off: they can only wait for their own stylist.</span></span>
          <input type="checkbox" className="mt-1 h-5 w-5" checked={s.substitutes} onChange={(e) => setS({ ...s, substitutes: e.target.checked })} />
        </label>
        <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-medium">&ldquo;Same time&rdquo; means within</span>
          <select className={input} value={s.windowMinutes} onChange={(e) => setS({ ...s, windowMinutes: Number(e.target.value) })}>
            {[30, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes of their time</option>)}
          </select>
        </label>
        <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-medium">Links close</span>
          <select className={input} value={s.closeHoursBefore} onChange={(e) => setS({ ...s, closeHoursBefore: Number(e.target.value) })}>
            <option value={0}>At the appointment time</option>
            <option value={2}>2 hours before</option>
            <option value={12}>12 hours before</option>
            <option value={24}>A day before</option>
          </select>
        </label>
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <label className="flex items-start justify-between gap-3 text-sm">
          <span><span className="font-medium">Make up for the change with a discount</span><span className="block text-muted">Taken off the new appointment&rsquo;s price automatically. First come, first served: only real openings are offered, checked again when the client picks.</span></span>
          <input type="checkbox" className="mt-1 h-5 w-5" checked={s.discounts} onChange={(e) => setS({ ...s, discounts: e.target.checked })} />
        </label>
        {s.discounts && (
          <>
            <ul className="space-y-3">
              {SICK_OPTIONS.map((o) => {
                const v = s.options[o.key];
                const off = o.key !== "otherDaySame" && !s.substitutes;
                return (
                  <li key={o.key} className={`rounded-lg border border-line p-3 ${off ? "opacity-50" : ""}`}>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={v.on} disabled={off} onChange={(e) => opt(o.key, { on: e.target.checked })} />
                      {o.label}
                    </label>
                    <p className="ml-6 text-xs text-muted">{off ? "Turn on Offer other stylists to use this." : o.hint}</p>
                    {v.on && !off && (
                      <div className="ml-6 mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <select className={input} value={v.kind} onChange={(e) => opt(o.key, { kind: e.target.value as "amount" | "percent", value: e.target.value === "percent" ? 10 : 500 })} aria-label={`${o.label}: dollars or percent`}>
                          <option value="amount">$ off</option>
                          <option value="percent">% off</option>
                        </select>
                        <input
                          className={`${input} w-24`}
                          inputMode="decimal"
                          aria-label={`${o.label}: amount`}
                          value={v.kind === "percent" ? String(v.value) : (v.value / 100).toFixed(v.value % 100 ? 2 : 0)}
                          onChange={(e) => {
                            const n = Number(e.target.value.replace(/[^0-9.]/g, "")) || 0;
                            opt(o.key, { value: v.kind === "percent" ? Math.min(100, Math.round(n)) : Math.round(n * 100) });
                          }}
                        />
                        <span className="text-muted">{v.kind === "percent" ? "% off the services" : "dollars off"}</span>
                        <label className="flex basis-full flex-wrap items-center gap-2">
                          Salon pays
                          <select className={input} value={v.salonShare} onChange={(e) => opt(o.key, { salonShare: Number(e.target.value) })} aria-label={`${o.label}: who pays`}>
                            {[100, 75, 50, 25, 0].map((p) => <option key={p} value={p}>{p === 100 ? "all of it" : p === 0 ? "none (stylist pays all)" : `${p}% (stylist ${100 - p}%)`}</option>)}
                          </select>
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <label className="flex items-start justify-between gap-3 text-sm">
              <span><span className="font-medium">Can combine with promo codes and package savings</span><span className="block text-muted">Off: the client gets whichever saves them more, not both.</span></span>
              <input type="checkbox" className="mt-1 h-5 w-5" checked={s.stack} onChange={(e) => setS({ ...s, stack: e.target.checked })} />
            </label>
          </>
        )}
      </div>

      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
      <button
        className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50"
        disabled={pending}
        onClick={() => start(async () => { const r = await saveSickSettings(s); setMsg(r.ok ? { ok: true, text: "Sick day settings saved." } : { ok: false, text: r.error }); })}
      >
        Save sick day settings
      </button>
    </section>
  );
}
