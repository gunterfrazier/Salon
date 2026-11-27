"use client";

import { useMemo, useState, useTransition } from "react";
import { applyForm, type PolicyForm } from "@/lib/policy/edit";
import { policyText } from "@/lib/policy/text";
import type { PolicySettings } from "@/lib/policy/types";
import { savePolicies } from "./actions";

const card = "space-y-3 rounded-2xl border border-line bg-surface p-4";
const num = "w-24 rounded-lg border border-line bg-background px-2 py-1.5 text-right text-base tabular-nums";

/** Deposits, cancellation notice, fees and flags, with the client-facing wording. */
export default function PoliciesForm({ initial, policy }: { initial: PolicyForm; policy: PolicySettings }) {
  const [f, setF] = useState<PolicyForm>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();
  const draft = useMemo(() => applyForm(policy, f), [policy, f]);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = (patch: Partial<PolicyForm>) => {
    setF({ ...f, ...patch });
    setMsg(null);
  };

  const deposit = (k: "colorDeposit" | "standardDeposit", title: string, hint: string) => (
    <div key={k} className="rounded-xl border border-line p-3">
      <label className="flex items-start justify-between gap-3">
        <span>
          <span className="font-medium">{title}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        <input type="checkbox" className="mt-0.5 h-5 w-5" checked={f[k].on} onChange={(e) => set({ [k]: { ...f[k], on: e.target.checked } })} aria-label={`${title}: ask new clients for a deposit`} />
      </label>
      {f[k].on && (
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">Usually $<input className={num} inputMode="decimal" type="number" min={0} step="1" value={f[k].amount} onChange={(e) => set({ [k]: { ...f[k], amount: Number(e.target.value) } })} /></label>
          <label className="flex items-center gap-2">At least $<input className={num} inputMode="decimal" type="number" min={0} step="1" value={f[k].minimum} onChange={(e) => set({ [k]: { ...f[k], minimum: Number(e.target.value) } })} /></label>
        </div>
      )}
    </div>
  );

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-28">
      <header>
        <h1 className="font-display text-3xl">Policies</h1>
        <p className="text-sm text-muted">Deposits, cancellations and no-shows. Clients agree to these when they book online; changes apply to new bookings.</p>
      </header>

      <section className={card}>
        <h2 className="font-semibold">Deposits for new clients</h2>
        {deposit("colorDeposit", "Color services", "Highlights, balayage, all-over color and the like.")}
        {deposit("standardDeposit", "Everything else", "Cuts, styles, waxing and treatments.")}
        <p className="text-xs text-muted">A deposit never asks for more than the services cost: a $20 cut never needs more than $20.</p>
        <label className="flex items-start justify-between gap-3 border-t border-line pt-3">
          <span>
            <span className="font-medium">Clients with a no-show or late cancel pay in full up front</span>
            <span className="block text-xs text-muted">Until the flag clears.</span>
          </span>
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={f.flaggedPayFull} onChange={(e) => set({ flaggedPayFull: e.target.checked })} />
        </label>
        <label className="flex items-start justify-between gap-3 border-t border-line pt-3">
          <span>
            <span className="font-medium">Let the team change or waive a deposit when booking</span>
            <span className="block text-xs text-muted">Only people whose access includes &ldquo;Change or waive a deposit&rdquo; (Team page).</span>
          </span>
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={f.staffCanChangeDeposit} onChange={(e) => set({ staffCanChangeDeposit: e.target.checked })} />
        </label>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Cancellations and no-shows</h2>
        <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">Notice needed to cancel without a fee</span>
          <span className="flex items-center gap-2"><input className={num} type="number" min={0} max={168} value={f.lateCancelWindowHours} onChange={(e) => set({ lateCancelWindowHours: Number(e.target.value) })} /> hours</span>
        </label>
        {([["lateCancelFee", "Late cancel"], ["noShowFee", "No-show"]] as const).map(([k, l]) => (
          <label key={k} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">{l} fee</span>
            <select className="rounded-lg border border-line bg-background px-3 py-1.5" value={f[k]} onChange={(e) => set({ [k]: e.target.value as "full" | "none" })}>
              <option value="full">Full price of the services</option>
              <option value="none">No fee (just flag it)</option>
            </select>
          </label>
        ))}
        <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">A flag clears after</span>
          <select className="rounded-lg border border-line bg-background px-3 py-1.5" value={f.clearAfterVisits ?? "never"} onChange={(e) => set({ clearAfterVisits: e.target.value === "never" ? null : Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} on-time visit{n === 1 ? "" : "s"}</option>)}
            <option value="never">Only when cleared by hand</option>
          </select>
        </label>
        <p className="text-xs text-muted">You can still choose a different fee, or none, each time you cancel or mark a no-show.</p>
      </section>

      <section className={card}>
        <h2 className="font-semibold">What clients see when booking online</h2>
        {draft.ok ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {policyText(draft.policy).map((l) => <li key={l}>{l}</li>)}
          </ul>
        ) : (
          <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{draft.error}</p>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 [body:has(.tabbar)_&]:bottom-16">
        <div className="mx-auto flex max-w-2xl items-center justify-end gap-3">
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-muted" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
          <button
            className="rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent disabled:opacity-40"
            disabled={!dirty || !draft.ok || saving}
            onClick={() => start(async () => {
              const r = await savePolicies(f);
              setMsg(r.ok ? { ok: true, text: "Saved. New bookings use these now." } : { ok: false, text: r.error });
            })}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </main>
  );
}
