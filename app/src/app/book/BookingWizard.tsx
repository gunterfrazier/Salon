"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import SearchControls from "@/components/SearchControls";
import { waterRipple } from "@/components/ripple";
import { cleanFavorites, type Favorites, type Opening, type SearchCriteria } from "@/lib/booking/search";
import type { Hours } from "@/lib/booking/availability";
import { buildBooking, toBookable } from "@/lib/booking/build";
import type { PublicService } from "@/lib/data/public-booking";
import { duration, money } from "@/lib/format";
import type { PolicySettings } from "@/lib/policy/types";
import type { BundleRule } from "@/lib/pricing/discounts";
import { suggestOrder } from "@/lib/schedule/plan";
import { formatDay, formatSlot, parseHHMM, toHHMM, tzAbbrev, WEEKDAY_KEYS, zonedToUtc, zoneLabel } from "@/lib/time/zone";
import { NEW_CLIENT_STATE } from "@/lib/ui/standing";
import { findPublicOpenings, getTimes, joinWaitlistOnline, submitOnlineBooking, type OnlineBookingResult } from "./actions";

const FAV_KEY = "chairvana.favorites.v1";
function readFavorites(): Favorites | null {
  try {
    return cleanFavorites(JSON.parse(localStorage.getItem(FAV_KEY) ?? "null"));
  } catch {
    return null;
  }
}
function writeFavorites(f: Favorites | null) {
  try {
    if (f) localStorage.setItem(FAV_KEY, JSON.stringify(f));
    else localStorage.removeItem(FAV_KEY);
  } catch {
    /* storage unavailable */
  }
}

type Step = "services" | "when" | "details";
const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base";
const STAGES = { consult: 0, chemical: 1, treatment: 2, cut: 3, style: 4, wax: 5, fee: 9 };

export default function BookingWizard({
  salon, business, services, dates, policyLines, initialPicked = [], prefill, stylists = [], initialStaff = null, initialSlot = null,
}: {
  /** The salon's web address (slug). */
  salon: string;
  business: { name: string; timezone: string; hours: Hours; policy: PolicySettings; rules: BundleRule[] };
  services: PublicService[];
  dates: string[];
  policyLines: string[];
  /** "Book again" from the client portal. */
  initialPicked?: string[];
  /** Signed-in client's details. */
  prefill?: { firstName: string; lastName: string; phone: string; email: string };
  /** Stylists to choose from (shown when there's more than one). */
  stylists?: { id: string; name: string; title: string | null; serviceIds: string[] | null }[];
  initialStaff?: string | null;
  /** An opening chosen elsewhere (Find): go straight to details. */
  initialSlot?: { date: string; time: string } | null;
}) {
  const [staffId, setStaffId] = useState<string>(initialStaff ?? "any");
  const [step, setStep] = useState<Step>(initialSlot && initialPicked.length ? "details" : "services");
  const [picked, setPicked] = useState<string[]>(() => initialPicked.filter((id) => services.some((s) => s.id === id)));
  const [date, setDate] = useState<string | null>(initialSlot && initialPicked.length ? initialSlot.date : null);
  const [times, setTimes] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(initialSlot && initialPicked.length ? initialSlot.time : null);
  const [f, setF] = useState({ firstName: prefill?.firstName ?? "", lastName: prefill?.lastName ?? "", phone: prefill?.phone ?? "", email: prefill?.email ?? "", notes: "", website: "" });
  const [agreed, setAgreed] = useState(false);
  const [textOk, setTextOk] = useState(false);
  /** Joining the waitlist instead of booking a time. */
  const [waiting, setWaiting] = useState(false);
  const [waitWeeks, setWaitWeeks] = useState(4);
  const [joined, setJoined] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<SearchCriteria>({ weekdays: [], block: "any", start: { kind: "next" } });
  const [openings, setOpenings] = useState<Opening[] | null>(null);
  const [searching, startSearching] = useTransition();
  /** Favorites remembered on this device (shown as instant openings). */
  const [savedFav, setSavedFav] = useState<Favorites | null>(null);
  const [remember, setRemember] = useState(true);
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
  const openDays = WEEKDAY_KEYS.map((k, i) => (business.hours[k] ? i : -1)).filter((i) => i >= 0);

  // Returning visitor with saved favorites: pre-select and show openings right away.
  useEffect(() => {
    const fav = readFavorites();
    if (!fav) return;
    const ids = fav.serviceIds.filter((id) => byId.has(id));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedFav(fav);
    if (ids.length) setPicked(ids);
    setCriteria({ weekdays: fav.weekdays.filter((d) => openDays.includes(d)), block: fav.block, start: { kind: "next" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search whenever services or criteria change.
  const searchKey = JSON.stringify([ordered.map((s) => s.id), criteria, staffId]);
  useEffect(() => {
    if (!ordered.length || addOnOnly) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenings(null);
      return;
    }
    startSearching(async () => {
      const r = await findPublicOpenings(salon, ordered.map((s) => s.id), criteria, staffId);
      setOpenings(r.ok ? r.openings : []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  const pickOpening = (o: Opening) => {
    setDate(o.date);
    setTime(toHHMM(o.minutes));
    setTimes(null);
    setError(null);
    setStep("details");
  };

  const openingsList = (list: Opening[], max = 24) => {
    const byDate = new Map<string, Opening[]>();
    for (const o of list.slice(0, max)) byDate.set(o.date, [...(byDate.get(o.date) ?? []), o]);
    return (
      <ul className="space-y-3">
        {[...byDate.entries()].map(([d, os]) => (
          <li key={d}>
            <p className="text-sm font-semibold">{formatDay(d, { weekday: "long", month: "short", day: "numeric" })}</p>
            <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {os.map((o) => (
                <button key={o.minutes} onClick={() => pickOpening(o)} className="rounded-xl border border-line bg-surface py-2.5 text-sm font-semibold hover:border-accent">
                  {formatSlot(o.date, o.minutes, business.timezone)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    );
  };

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
      const r = await getTimes(salon, d, ordered.map((s) => s.id), staffId);
      if (r.ok) setTimes(r.times);
      else setError(r.error);
    });
  }

  function submit() {
    setError(null);
    startSaving(async () => {
      const fav: Favorites | null = remember ? cleanFavorites({ serviceIds: ordered.map((s) => s.id), weekdays: criteria.weekdays, block: criteria.block }) : null;
      const r = await submitOnlineBooking({ salon, serviceIds: ordered.map((s) => s.id), staffId, date: date!, time: time!, ...f, agreed, textOk, favorites: fav ?? undefined });
      if (r.ok) {
        writeFavorites(fav);
        setDone(r);
      }
      else {
        setError(r.error);
        if (/time was just taken/.test(r.error) && date) {
          setStep("when");
          pickDate(date);
        }
      }
    });
  }

  function joinWait() {
    setError(null);
    startSaving(async () => {
      const r = await joinWaitlistOnline({ salon, serviceIds: ordered.map((s) => s.id), staffId, weekdays: criteria.weekdays, block: criteria.block, weeks: waitWeeks, ...f, textOk });
      if (r.ok) setJoined(r.summary);
      else setError(r.error);
    });
  }

  const header = (
    <header className="mb-5">
      <p className="text-sm text-muted">Book online</p>
      <h1 className="text-2xl font-bold">{business.name}</h1>
    </header>
  );

  if (joined) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        {header}
        <section className="rounded-2xl border border-line bg-surface p-5" role="status">
          <h2 className="text-xl font-bold">You&rsquo;re on the waitlist</h2>
          <p className="mt-2">{joined}</p>
          <p className="mt-2 text-muted">When a matching time opens, we&rsquo;ll {textOk ? "text" : "email"} you a link to book it. The first person to book gets the time, so book quickly if it works for you.</p>
        </section>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        {header}
        <section className="rounded-2xl border border-line bg-surface p-5" role="status">
          {done.status === "booked" && (
            <svg viewBox="0 0 24 24" className="mb-2 size-10 rounded-full border border-line p-2" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path className="check-stroke" d="M 5 12.5 C 7.5 15, 9 16.5, 10.5 17.5 C 13 13, 16 9, 19.5 6.5" />
            </svg>
          )}
          <h2 className="text-xl font-bold">{done.status === "booked" ? "You’re all set. See you in the chair." : "Almost done: send your deposit"}</h2>
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

      {step === "services" && savedFav && ordered.length > 0 && (
        <section className="mb-6 rounded-2xl border-2 border-accent bg-surface p-4" aria-live="polite">
          <h2 className="font-semibold">Openings that match your favorites</h2>
          <p className="text-sm text-muted">
            {ordered.map((s) => s.name).join(" + ")}
            {criteria.weekdays.length ? ` · ${criteria.weekdays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}` : ""}
            {criteria.block !== "any" ? ` · ${typeof criteria.block === "string" ? criteria.block : "your times"}` : ""}
          </p>
          <div className="mt-3">
            {searching && <p className="text-sm text-muted">Finding openings…</p>}
            {!searching && openings && openings.length === 0 && <p className="text-sm text-muted">No openings match right now. Tap Next to search other days and times.</p>}
            {!searching && openings && openings.length > 0 && openingsList(openings, 8)}
          </div>
        </section>
      )}

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

      {step === "when" && stylists.length > 1 && (
        <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">With</h2>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Stylist">
            {[{ id: "any", name: "Anyone available", title: null, serviceIds: null }, ...stylists]
              .filter((s) => s.id === "any" || !s.serviceIds || ordered.every((o) => s.serviceIds!.includes(o.id)))
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={staffId === s.id}
                  onClick={() => {
                    setStaffId(s.id);
                    setDate(null);
                    setTime(null);
                    setTimes(null);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${staffId === s.id ? "border-foreground bg-foreground font-semibold text-background" : "border-line"}`}
                >
                  {s.name}
                  {s.title && <span className="block text-xs opacity-80">{s.title}</span>}
                </button>
              ))}
          </div>
        </section>
      )}

      {step === "when" && (
        <section className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-4" aria-live="polite">
          <h2 className="font-semibold">Find a time</h2>
          <SearchControls criteria={criteria} onChange={setCriteria} openDays={openDays} zone={tzAbbrev(new Date(), business.timezone)} />
          <div>
            {searching && <p className="text-sm text-muted">Finding openings…</p>}
            {!searching && openings && openings.length === 0 && <p className="text-sm text-muted">No openings match. Try more days or a wider time.</p>}
            {!searching && openings && openings.length > 0 && openingsList(openings)}
          </div>
          {!searching && openings && ordered.length > 0 && !addOnOnly && (
            <div className="rounded-xl border border-dashed border-line p-3 text-sm">
              <p className="font-semibold">Nothing that works?</p>
              <p className="text-muted">Join the waitlist. We&rsquo;ll text or email you when a time opens on the days and times picked above.</p>
              <button
                onClick={() => {
                  setWaiting(true);
                  setError(null);
                  setStep("details");
                }}
                className="mt-2 rounded-lg border border-line px-3 py-2 font-semibold hover:bg-background"
              >
                Join the waitlist
              </button>
            </div>
          )}
        </section>
      )}

      {step === "when" && (
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold">Or pick a day</h2>
            <p className="text-sm text-muted">All times are {zoneLabel(business.timezone, date ? zonedToUtc(date, 12 * 60, business.timezone) : new Date())}, the salon&rsquo;s local time.</p>
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
                      {formatSlot(date, parseHHMM(t), business.timezone)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {step === "details" && waiting && (
        <section className="mb-4 space-y-2 rounded-xl bg-surface p-4 text-sm">
          <p className="font-semibold">Waitlist: {ordered.map((s) => s.name).join(" + ")}</p>
          <p className="text-muted">
            {criteria.weekdays.length ? criteria.weekdays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ") : "Any day"}
            {" · "}
            {criteria.block === "any" ? "any time" : typeof criteria.block === "string" ? `${criteria.block}s` : "your times"}
            {stylists.length > 1 ? ` · ${staffId === "any" ? "anyone" : `with ${stylists.find((x) => x.id === staffId)?.name ?? "your stylist"}`}` : ""}
          </p>
          <label className="flex items-center gap-2">
            For the next
            <select className="rounded-lg border border-line bg-surface px-2 py-1.5" value={waitWeeks} onChange={(e) => setWaitWeeks(Number(e.target.value))}>
              {[1, 2, 4, 6, 8].map((w) => <option key={w} value={w}>{w} week{w === 1 ? "" : "s"}</option>)}
            </select>
          </label>
          <p className="text-muted">We&rsquo;ll send at most one message a day, and only when there&rsquo;s a new opening. Tick &ldquo;Text me&rdquo; below or add your email so we can reach you.</p>
        </section>
      )}

      {step === "details" && ((date && time) || waiting) && (
        <section className="space-y-4">
          {!waiting && date && time && (
          <div className="rounded-xl bg-surface p-4 text-sm">
            <p className="font-semibold">{formatDay(date, { weekday: "long", month: "long", day: "numeric" })} at {formatSlot(date, parseHHMM(time), business.timezone)}</p>
            <p className="text-muted">{ordered.map((s) => s.name).join(" + ")}</p>
          </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={input} placeholder="First name" aria-label="First name" autoComplete="given-name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
            <input className={input} placeholder="Last name" aria-label="Last name" autoComplete="family-name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
            <input className={input} placeholder="Mobile number" aria-label="Mobile number" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <input className={input} placeholder="Email (optional)" aria-label="Email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
            <input type="checkbox" checked={textOk} onChange={(e) => setTextOk(e.target.checked)} className="mt-1 size-5 accent-[var(--accent)]" />
            <span className="text-sm">
              <span className="font-semibold">Text me about my appointments</span>
              <span className="block text-muted">
                Confirmations, reminders and changes from {business.name}, sent through Chairvana. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. Not required to book.{" "}
                <a href="/texting" target="_blank" className="underline">Texting terms</a> · <a href="/privacy" target="_blank" className="underline">Privacy</a>
              </span>
            </span>
          </label>
          <textarea className={input} rows={2} placeholder="Anything we should know? (optional)" aria-label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          {/* Honeypot for bots: hidden from people and screen readers. */}
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} name="website" />
          {!waiting && (
          <>
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
          <div className="rounded-xl border border-line bg-surface p-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-1 size-5 accent-[var(--accent)]" />
              <span className="text-sm">
                <span className="font-semibold">Remember my favorites</span>
                <span className="block text-muted">Next time, see openings for these services{criteria.weekdays.length || criteria.block !== "any" ? " on your favorite days and times" : ""} as soon as you open this page.</span>
              </span>
            </label>
          </div>
          </>
          )}
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
              <button className="rounded-xl px-3 py-3" onClick={() => {
                  if (step === "details") setWaiting(false);
                  setStep(step === "details" ? "when" : "services");
                }}>Back</button>
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
            {step === "details" && waiting && (
              <button
                disabled={saving || !f.firstName.trim() || !f.lastName.trim() || f.phone.replace(/\D/g, "").length < 10 || (!textOk && !f.email.trim())}
                onClick={joinWait}
                className="rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent disabled:opacity-40"
              >
                {saving ? "Joining…" : "Join waitlist"}
              </button>
            )}
            {step === "details" && !waiting && (
              <button
                disabled={saving || !agreed || !f.firstName.trim() || !f.lastName.trim() || f.phone.replace(/\D/g, "").length < 10}
                onClick={(e) => {
                  waterRipple(e.currentTarget, e);
                  submit();
                }}
                className="relative overflow-hidden rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent disabled:opacity-40"
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

