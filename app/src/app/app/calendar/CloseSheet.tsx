"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { settleCancel } from "@/lib/checkout/settle";
import type { CalAppointment, CalendarData } from "@/lib/data/calendar-types";
import { money } from "@/lib/format";
import { cancelDefaults, type ChargeOption } from "@/lib/policy/engine";
import { closeAppointment } from "./actions";

const input = "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base";
export const toCents = (s: string) => (s.trim() === "" ? NaN : Math.round(Number(s) * 100));

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[95dvh] w-full max-w-lg flex-col rounded-t-2xl bg-surface sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl" aria-label="Close">×</button>
        </div>
        <div className="space-y-5 overflow-y-auto px-5 py-4">{children}</div>
        <div className="border-t border-line px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

type OptKind = ChargeOption["kind"];

export default function CloseSheet({
  a, data, mode, onClose, onDone,
}: {
  a: CalAppointment; data: CalendarData; mode: "cancel" | "no_show"; onClose: () => void; onDone: () => void;
}) {
  const policy = data.policy;
  const reasons = policy.stylistInitiatedCancel.reasons;
  const fullPrice = a.services.reduce((s, l) => s + l.finalPrice, 0);
  const [reasonKey, setReasonKey] = useState<string | null>(mode === "no_show" ? null : null);
  const [kind, setKind] = useState<OptKind | null>(null);
  const [percent, setPercent] = useState(50);
  const [custom, setCustom] = useState("");
  const [flag, setFlag] = useState<boolean | null>(null);
  const [notify, setNotify] = useState(true);
  const [collect, setCollect] = useState(false);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  // Policy defaults for the chosen reason (or no-show). User picks override.
  const defaults = useMemo(() => {
    if (mode === "no_show") return cancelDefaults({ by: "no_show" }, new Date(a.start), new Date(), policy);
    if (!reasonKey) return null;
    return cancelDefaults({ by: "stylist", reasonKey }, new Date(a.start), new Date(), policy);
  }, [mode, reasonKey, a.start, policy]);

  const chosenKind: OptKind | null = kind ?? (defaults ? defaults.defaultOption.kind : null);
  const flagOn = flag ?? !!defaults?.flagType;
  const option: ChargeOption | null =
    chosenKind === "percent" ? { kind: "percent", percent } : chosenKind === "custom" ? { kind: "custom", amount: toCents(custom) } : chosenKind ? { kind: chosenKind } : null;

  let settle: ReturnType<typeof settleCancel> | null = null;
  let problem: string | null = null;
  if (option && defaults) {
    try {
      if (option.kind === "custom" && !Number.isFinite(option.amount)) throw new Error("Enter an amount.");
      settle = settleCancel(option, fullPrice, a.depositPaid, { refundDepositIfNoCharge: defaults.refundDepositIfNoCharge, collectNow: collect });
    } catch (e) {
      problem = (e as Error).message;
    }
  }

  function confirm() {
    if (!option) return;
    setError(null);
    start(async () => {
      const res = await closeAppointment({
        appointmentId: a.id,
        mode,
        reasonKey: reasonKey ?? undefined,
        option,
        flag: flagOn,
        notifyClient: mode === "cancel" ? notify : false,
        collect: collect ? { method, reference } : null,
      });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  const radio = (k: OptKind, label: React.ReactNode) => (
    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${chosenKind === k ? "border-accent" : "border-line"}`}>
      <input type="radio" name="charge" checked={chosenKind === k} onChange={() => setKind(k)} className="size-4 accent-[var(--accent)]" />
      <span className="flex-1">{label}</span>
    </label>
  );

  const insideWindow = defaults?.insideWindow;
  return (
    <Sheet
      title={mode === "no_show" ? `No-show: ${a.clientName}` : `Cancel: ${a.clientName}`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">{error ?? problem}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2.5">Back</button>
            <button
              onClick={confirm}
              disabled={!settle || saving}
              className="rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white disabled:opacity-40 dark:bg-red-600"
            >
              {saving ? "Saving…" : mode === "no_show" ? "Mark no-show" : "Cancel appointment"}
            </button>
          </div>
        </div>
      }
    >
      {mode === "cancel" && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Why is it being cancelled?</legend>
          {reasons.map((r) => (
            <label key={r.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${reasonKey === r.key ? "border-accent" : "border-line"}`}>
              <input type="radio" name="reason" checked={reasonKey === r.key} onChange={() => { setReasonKey(r.key); setKind(null); setFlag(null); }} className="size-4 accent-[var(--accent)]" />
              {r.label}
            </label>
          ))}
        </fieldset>
      )}

      {defaults && (
        <>
          <p className="rounded-lg bg-background px-3 py-2 text-sm">
            {mode === "no_show"
              ? "Policy: no-shows are charged the full price."
              : insideWindow
                ? `Less than ${policy.lateCancelWindowHours} hours' notice.`
                : `More than ${policy.lateCancelWindowHours} hours' notice.`}{" "}
            Services total {money(fullPrice)}{a.depositPaid > 0 ? `, deposit paid ${money(a.depositPaid)}` : ""}.
          </p>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Charge the client?</legend>
            {radio("none", "No charge")}
            {radio("full", <>Full price <span className="text-muted">{money(fullPrice)}</span></>)}
            {radio(
              "percent",
              <span className="flex flex-wrap items-center gap-1.5">
                Percentage
                {chosenKind === "percent" && (
                  <>
                    {policy.fees.percentPresets.map((p) => (
                      <button key={p} type="button" onClick={() => setPercent(p)} className={`rounded-full border px-2.5 py-0.5 text-sm ${percent === p ? "border-accent bg-accent text-on-accent" : "border-line"}`}>{p}%</button>
                    ))}
                    <input type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(Number(e.target.value))} className="w-16 rounded-lg border border-line bg-background px-2 py-1 text-sm" aria-label="Percent" />
                    <span className="text-muted">= {money(Math.round((fullPrice * percent) / 100))}</span>
                  </>
                )}
              </span>,
            )}
            {radio(
              "custom",
              <span className="flex items-center gap-2">
                Custom amount
                {chosenKind === "custom" && (
                  <>
                    <span>$</span>
                    <input type="number" inputMode="decimal" step="0.01" min={0} max={fullPrice / 100} value={custom} onChange={(e) => setCustom(e.target.value)} className="w-28 rounded-lg border border-line bg-background px-2 py-1" aria-label="Custom amount" />
                    <span className="text-xs text-muted">up to {money(fullPrice)}</span>
                  </>
                )}
              </span>,
            )}
          </fieldset>

          {settle && (
            <div className="space-y-1 rounded-xl border border-line p-3 text-sm">
              <Row label="Fee" value={money(settle.fee)} bold />
              {settle.depositApplied > 0 && <Row label="Deposit applied" value={`−${money(settle.depositApplied)}`} />}
              {settle.refund > 0 && <Row label="Deposit to return to client" value={money(settle.refund)} />}
              {settle.fee - settle.depositApplied > 0 && (
                <div className="mt-2 space-y-2 border-t border-line pt-2">
                  <Row label="Still owed" value={money(settle.fee - settle.depositApplied)} bold />
                  <label className="flex items-center gap-2">
                    <input type="radio" name="collect" checked={!collect} onChange={() => setCollect(false)} className="size-4 accent-[var(--accent)]" />
                    Add to client&rsquo;s balance (must be paid before next booking)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="collect" checked={collect} onChange={() => setCollect(true)} className="size-4 accent-[var(--accent)]" />
                    Client paid it now
                  </label>
                  {collect && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select value={method} onChange={(e) => setMethod(e.target.value)} className={input} aria-label="Payment method">
                        {data.paymentMethods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </select>
                      <input value={reference} onChange={(e) => setReference(e.target.value)} className={input} placeholder="Reference (optional)" aria-label="Reference" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <label className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5">
            <input type="checkbox" checked={flagOn} onChange={(e) => setFlag(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
            <span>
              <span className="font-semibold">Flag client for {mode === "no_show" ? "no-show" : "late cancellation"}</span>
              <span className="block text-sm text-muted">
                Next bookings need full payment up front until {policy.flags.clearAfterOnTimeVisits ?? "some"} on-time visits. Stays in their history.
              </span>
            </span>
          </label>
          {mode === "cancel" && (
            <label className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
              <span>
                <span className="font-semibold">Let the client know</span>
                <span className="block text-sm text-muted">Sends the cancellation message (Settings › Messages), if it&apos;s turned on.</span>
              </span>
            </label>
          )}
        </>
      )}
    </Sheet>
  );
}

export function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
