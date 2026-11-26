"use client";

import { useMemo, useState, useTransition } from "react";
import type { Hours } from "@/lib/booking/availability";
import { buildBooking, toBookable } from "@/lib/booking/build";
import type { PublicService } from "@/lib/data/public-booking";
import { duration, money } from "@/lib/format";
import type { PolicySettings } from "@/lib/policy/types";
import type { BundleRule } from "@/lib/pricing/discounts";
import { suggestOrder } from "@/lib/schedule/plan";
import { formatDay, formatMinutes, parseHHMM } from "@/lib/time/zone";
import { NEW_CLIENT_STATE } from "@/lib/ui/standing";
import { getTimes, submitOnlineBooking, type OnlineBookingResult } from "./actions";

type Step = "services" | "when" | "details";
const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base";
const STAGES = { consult: 0, chemical: 1, treatment: 2, cut: 3, style: 4, wax: 5, fee: 9 };

export default function BookingWizard({
  business, services, dates, policyLines,
}: {
  business: { name: string; timezone: string; hours: Hours; policy: PolicySettings; rules: BundleRule[] };
  services: PublicService[];
  dates: string[];
  policyLines: string[];
}) {
  const [step, setStep] = useState<Step>("services");
  const [picked, setPicked] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [times, setTimes] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", email: "", notes: "", website: "" });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<OnlineBookingResult, { ok: true }> | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const groups = useMemo(() => {
    const g = new Map<string, PublicService[]>();
    for (const s of services) g.set(s.category, [...(g.get(s.category) ?? []), s]);
    return [...g.entries()];
  }, [services]);

  // Services in the order they'll be done (color first, then cut, style…).
  const ordered = useMemo(() => suggestOrder(picked.map((id) => toBookable(byId.get(id)!)), STAGES), [picked, byId]);
  const estimate = useMemo(() => {
    if (!ordered.length) return null;
    try {
      return buildBooking({ services: ordered, start: new Date(), rules: business.rules, policy: business.policy, client: NEW_CLIENT_STATE, now: new Date() });
    } catch {
      return null;
    }
  }, [ordered, business.rules, business.policy]);
  const addOnOnly = ordered.length > 0 && ordered.every((s) => s.isAddOn);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setTimes(null);
    setTime(null);
  }

  function pickDate(d: string) {
    setDate(d);
    setTime(null);
    setTimes(null);
    setError(null);
    startLoading(async () => {
      const r = await getTimes(d, ordered.map((s) => s.id));
      if (r.ok) setTimes(r.times);
      else setError(r.error);
    });
  }

  function submit() {
    setError(null);
    startSaving(async () => {
      const r = await submitOnlineBooking({ serviceIds: ordered.map((s) => s.id), date: date!, time: time!, ...f, agreed });
      if (r.ok) setDone(r);
      else {
        setError(r.error);
        if (/time was just taken/.test(r.error) && date) {
          setStep("when");
          pickDate(date);
        }
      }
    });
  }

  const header = (
    <header className="mb-5">
      <p className="text-sm text-muted">Book online</p>
      <h1 className="text-2xl font-bold">{business.name}</h1>
    </header>
  );

  if (done) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        {header}
        <section className="rounded-2xl border border-line bg-surface p-5" role="status">
          <h2 className="text-xl font-bold">{done.status === "booked" ? "You're booked!" : "Almost done: send your deposit"}</h2>
          <p className="mt-2">{done.when}</p>
          <p className="text-muted">{done.services.join(" + ")} · est. {money(done.total)}{done.priceMayVary ? "+" : ""}</p>
          {done.status === "pending" && (
            <div className="mt-4 space-y-3">
              <p>
                Your time is held. Send a <strong>{money(done.deposit)}</strong> deposit to confirm. It counts toward your total.
              </p>
              {done.payWith.length > 0 ? (
                <ul className="space-y-2">
                  {done.payWith.map((p) => (
                    <li key={p.label} className="rounded-xl border border-line p-3">
                      <p className="font-semibold">{p.label}</p>
                      <p className="text-sm">{p.instructions}</p>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
                          Open {p.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">{business.name} will text you how to send it.</p>
              )}
              <p className="text-sm text-muted">Your booking is confirmed once the salon receives the deposit.</p>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-32 pt-8">
      {header}
      <ol className="mb-5 flex gap-2 text-sm" aria-label="Steps">
        {(["services", "when", "details"] as Step[]).map((s, i) => (
          <li key={s} className={`flex-1 rounded-full py-1 text-center ${step === s ? "bg-foreground font-semibold text-background" : "bg-surface text-muted"}`} aria-current={step === s ? "step" : undefined}>
            {i + 1}. {s === "services" ? "Services" : s === "when" ? "Day & time" : "Your details"}
          </li>
        ))}
      </ol>

      {step === "services" && (
        <section className="space-y-5">
          {groups.map(([cat, list]) => (
            <div key={cat}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{cat}</h2>
              <ul className="mt-2 space-y-2">
                {list.map((s) => {
                  const on = picked.includes(s.id);
                  const mins = s.active_min + s.processing_min + s.finish_min;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(s.id)}
                        className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left ${on ? "border-accent bg-accent/10 ring-2 ring-accent" : "border-line bg-surface"}`}
                      >
                        <span>
                          <span className="font-semibold">{s.name}</span>
                          {s.description && <span className="mt-0.5 block text-sm text-muted">{s.description}</span>}
                        </span>
                        <span className="shrink-0 text-right text-sm">
                          <span className="block font-semibold">{money(s.price_cents)}{s.price_type === "starting_at" ? "+" : ""}</span>
                          <span className="text-muted">{duration(mins)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {step === "when" && (
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold">Pick a day</h2>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
              {dates.map((d) => (
                <button
                  key={d}
                  onClick={() => pickDate(d)}
                  aria-pressed={date === d}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-center ${date === d ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}
                >
                  <span className="block text-xs">{formatDay(d, { weekday: "short" })}</span>
                  <span className="block font-semibold">{formatDay(d, { month: "short", day: "numeric" })}</span>
                </button>
              ))}
            </div>
          </div>
          {date && (
            <div>
              <h2 className="font-semibold">{formatDay(date, { weekday: "long", month: "long", day: "numeric" })}</h2>
              {loading && <p className="mt-2 text-muted">Finding open times…</p>}
              {!loading && times && times.length === 0 && <p className="mt-2 text-muted">No open times that day. Try another day.</p>}
              {!loading && times && times.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {times.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTime(t)}
                      aria-pressed={time === t}
                      className={`rounded-xl border py-2.5 font-semibold ${time === t ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}
                    >
                      {formatMinutes(parseHHMM(t))}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {step === "details" && date && time && (
        <section className="space-y-4">
          <div className="rounded-xl bg-surface p-4 text-sm">
            <p className="font-semibold">{formatDay(date, { weekday: "long", month: "long", day: "numeric" })} at {formatMinutes(parseHHMM(time))}</p>
            <p className="text-muted">{ordered.map((s) => s.name).join(" + ")}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={input} placeholder="First name" aria-label="First name" autoComplete="given-name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
            <input className={input} placeholder="Last name" aria-label="Last name" autoComplete="family-name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
            <input className={input} placeholder="Mobile number" aria-label="Mobile number" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <input className={input} placeholder="Email (optional)" aria-label="Email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </div>
          <textarea className={input} rows={2} placeholder="Anything we should know? (optional)" aria-label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          {/* Honeypot for bots: hidden from people and screen readers. */}
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} name="website" />
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-semibold">Booking policy</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {policyLines.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <label className="mt-3 flex items-start gap-3">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-5 accent-[var(--accent)]" />
              <span className="text-sm font-semibold">I agree to the booking policy</span>
            </label>
          </div>
        </section>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200" role="alert">{error}</p>}

      {/* Sticky footer: summary + next step */}
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 text-sm">
            {estimate ? (
              <>
                <p className="font-semibold">{money(estimate.priced.total)}{estimate.plan.priceMayVary ? "+" : ""} · {duration(estimate.plan.totalMinutes)}</p>
                <p className="truncate text-muted">{ordered.length} service{ordered.length === 1 ? "" : "s"}{estimate.priced.totalDiscount ? ` · ${money(estimate.priced.totalDiscount)} package savings` : ""}</p>
              </>
            ) : (
              <p className="text-muted">Pick one or more services</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {step !== "services" && (
              <button className="rounded-xl px-3 py-3" onClick={() => setStep(step === "details" ? "when" : "services")}>Back</button>
            )}
            {step === "services" && (
              <button disabled={!ordered.length || addOnOnly} onClick={() => setStep("when")} className="rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent disabled:opacity-40">
                Next
              </button>
            )}
            {step === "when" && (
              <button disabled={!time} onClick={() => setStep("details")} className="rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent disabled:opacity-40">
                Next
              </button>
            )}
            {step === "details" && (
              <button
                disabled={saving || !agreed || !f.firstName.trim() || !f.lastName.trim() || f.phone.replace(/\D/g, "").length < 10}
                onClick={submit}
                className="rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent disabled:opacity-40"
              >
                {saving ? "Booking…" : "Book"}
              </button>
            )}
          </div>
        </div>
        {addOnOnly && <p className="pb-2 text-center text-xs text-muted">Add a main service to book a travel fee.</p>}
      </div>
    </main>
  );
}

