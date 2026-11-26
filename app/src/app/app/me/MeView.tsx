"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { PortalAppt, PortalData } from "@/lib/data/portal";
import { money } from "@/lib/format";
import { formatDay, formatMinutes, formatTimeRange, parseHHMM, tzAbbrev, wallParts, zoneLabel, zonedToUtc } from "@/lib/time/zone";
import { leaveWaitlist, myOpenings, portalCancel, portalMove, portalMoveOptions, portalUpdateContact, savePreferences, type Level } from "./actions";
import { OpeningsCard } from "@/app/find/FindView";
import type { SalonResult } from "@/lib/discovery/openings";
import type { CustomerHome } from "@/lib/data/customer";

const card = "rounded-xl border border-line bg-surface p-4";
const btn = "rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50";
const primary = "rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50";

/** The customer's own page: every salon they use, upcoming visits, balances, history and preferences. */
export default function MeView({ me, salons, waiting = [], packages = [] }: { me: CustomerHome; salons: PortalData[]; waiting?: Waiting[]; packages?: { id: string; text: string; salon: string }[] }) {
  const upcoming = salons.flatMap((d) => d.upcoming.map((a) => ({ a, d }))).sort((x, y) => x.a.start.localeCompare(y.a.start));
  const past = salons.flatMap((d) => d.past.map((p) => ({ p, d }))).sort((x, y) => y.p.start.localeCompare(x.p.start)).slice(0, 20);
  const owed = salons.filter((d) => d.balance > 0);
  const lastDone = past.find((x) => x.p.status === "completed");
  const bookAgain = lastDone ? `/s/${lastDone.d.salon.slug}/book?services=${lastDone.p.serviceIds.join(",")}` : null;
  const home = me.preferredSalon ? `/s/${me.preferredSalon.slug}/book${me.preferredStylistId ? `?staff=${me.preferredStylistId}` : ""}` : "/find";
  const zones = [...new Set(salons.map((d) => d.salon.timezone))];
  const many = salons.length > 1;

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-xs text-muted">Chairvana</p>
            <p className="font-semibold">Hi{me.firstName ? `, ${me.firstName}` : ""}</p>
          </div>
          <nav className="flex gap-1 text-sm">
            <Link href={home} className="rounded-lg bg-foreground px-3 py-2 font-semibold text-background">Book</Link>
            <Link href="/find" className="rounded-lg px-3 py-2 hover:bg-background">Find</Link>
            <Link href="/app/account" className="rounded-lg px-3 py-2 hover:bg-background">Account</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {zones.length > 0 && <p className="text-xs text-muted">Times are {zones.map((z) => zoneLabel(z)).join(" / ")}.</p>}

        {owed.map((d) => (
          <section key={d.salon.id} className={card}>
            <h2 className="font-semibold">Balance due{many ? ` at ${d.salon.name}` : ""}: {money(d.balance)}</h2>
            <p className="mt-1 text-sm">Please pay before your next visit. <PayLinks text={d.balancePayWith} /></p>
          </section>
        ))}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          {upcoming.length === 0 && (
            <p className={`${card} text-sm`}>
              Nothing booked.{" "}
              {bookAgain ? (
                <Link href={bookAgain} className="underline">Book {lastDone!.p.services.join(", ")} again</Link>
              ) : (
                <Link href={home} className="underline">{me.preferredSalon ? `Book with ${me.preferredSalon.name}` : "Find a salon"}</Link>
              )}
            </p>
          )}
          {upcoming.map(({ a, d }) => (
            <Upcoming key={a.id} a={a} tz={d.salon.timezone} policy={d.policy} salonPhone={d.salon.phone} salon={many || !me.preferredSalon ? d.salon : null} />
          ))}
        </section>

        {packages.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold">Your packages</h2>
            <ul className="mt-1 text-sm">
              {packages.map((p) => <li key={p.id}>{p.text}{many && p.salon ? ` · ${p.salon}` : ""}</li>)}
            </ul>
            <p className="mt-1 text-xs text-muted">Visits are taken off when you check out.</p>
          </section>
        )}

        {waiting.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">On the waitlist</h2>
            {waiting.map((w) => <WaitingCard key={w.id} w={w} many={many} />)}
          </section>
        )}

        <OpeningsForYou me={me} />

        <Preferences me={me} />

        {past.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold">Past visits</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {past.map(({ p, d }) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-x-3 py-2">
                  <span>
                    {formatDay(wallParts(new Date(p.start), d.salon.timezone).date, { month: "short", day: "numeric", year: "numeric" })} · {p.services.join(", ")}
                    {many && <span className="text-muted"> · {d.salon.name}</span>}
                  </span>
                  <span className="text-muted">{p.status === "completed" ? money(p.total) : p.status === "cancelled" ? "Cancelled" : p.status === "no_show" ? "Missed" : ""}</span>
                </li>
              ))}
            </ul>
            {bookAgain && (
              <p className="mt-2 text-sm">
                <Link className="underline" href={bookAgain}>Book {lastDone!.p.services.join(", ")} again</Link>
              </p>
            )}
          </section>
        )}

        <Contact phone={me.phone ?? ""} smsOptIn={me.smsOptIn} email={me.email} />
      </main>
    </>
  );
}

/** Openings with my stylist → anyone at my salon → salons near me. */
type Waiting = { id: string; salon: string; what: string; window: string };

function WaitingCard({ w, many }: { w: Waiting; many: boolean }) {
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (gone) return <p className={`${card} text-sm`}>Removed from the waitlist.</p>;
  return (
    <article className={card}>
      <p className="font-semibold">{w.what}{many && w.salon ? ` · ${w.salon}` : ""}</p>
      <p className="text-sm text-muted">{w.window}</p>
      <p className="mt-1 text-sm text-muted">We&rsquo;ll let you know when a matching time opens.</p>
      <button
        className={`${btn} mt-2`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await leaveWaitlist(w.id);
            if (r.ok) setGone(true);
            else setError(r.error);
          })
        }
      >
        {pending ? "Removing…" : "Leave the waitlist"}
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </article>
  );
}

function OpeningsForYou({ me }: { me: CustomerHome }) {
  const levels = ([
    me.preferredStylistId ? ["stylist", `With ${me.preferredSalon?.stylists.find((s) => s.id === me.preferredStylistId)?.name.split(" ")[0] ?? "my stylist"}`] : null,
    me.preferredSalon ? ["salon", `Anyone at ${me.preferredSalon.name}`] : null,
    me.hasHome ? ["area", `Within ${me.searchMiles} mi`] : null,
  ].filter(Boolean) as [Level, string][]);
  const [level, setLevel] = useState<Level | null>(levels[0]?.[0] ?? null);
  const [service, setService] = useState("");
  const [res, setRes] = useState<{ results: SalonResult[]; services: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = (l: Level, text = service) =>
    start(async () => {
      setError(null);
      const r = await myOpenings(l, text);
      if (r.ok) {
        setRes(r);
        if (!text) setService(r.services.join(" + "));
      } else {
        setRes(null);
        setError(r.error);
      }
    });

  useEffect(() => {
    if (levels[0]) load(levels[0][0], "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!levels.length) {
    return (
      <section className={card}>
        <h2 className="font-semibold">Openings for you</h2>
        <p className="mt-1 text-sm text-muted">Pick your salon or add your home ZIP below and we&apos;ll show openings here. Or <Link href="/find" className="underline">search near you</Link>.</p>
      </section>
    );
  }
  const idx = levels.findIndex(([l]) => l === level);
  const wider = idx >= 0 && idx < levels.length - 1 ? levels[idx + 1] : null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Openings for you</h2>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="How wide to look">
          {levels.map(([l, label]) => (
            <button key={l} type="button" role="tab" aria-selected={level === l} onClick={() => { setLevel(l); load(l); }} className={`rounded-lg px-3 py-1.5 text-sm ${level === l ? "bg-foreground font-semibold text-background" : "border border-line"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (level) load(level); }}>
        <input className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-base" value={service} onChange={(e) => setService(e.target.value)} placeholder="What you'd like, e.g. Women's Cut" aria-label="Services" />
        <button className={btn} disabled={pending}>Search</button>
      </form>
      {pending && <p className="text-sm text-muted">Looking…</p>}
      {!pending && error && <p className="text-sm">{error}</p>}
      {!pending && res && res.results.map((r) => <OpeningsCard key={r.salon.id} r={r} />)}
      {!pending && res && res.results.length === 0 && <p className="text-sm">No openings found{level === "area" ? " nearby" : ""} for {res.services.join(" + ")}.</p>}
      {!pending && wider && (
        <button type="button" className="text-sm underline" onClick={() => { setLevel(wider[0]); load(wider[0]); }}>
          Look wider: {wider[1]}
        </button>
      )}
    </section>
  );
}

/** "My salon", "my stylist", and where to look for openings. */
function Preferences({ me }: { me: CustomerHome }) {
  const [salonId, setSalonId] = useState(me.preferredSalon?.id ?? "");
  const [staffId, setStaffId] = useState(me.preferredStylistId ?? "");
  const [zip, setZip] = useState(me.homeZip ?? "");
  const [miles, setMiles] = useState(me.searchMiles);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const sel = "w-full rounded-lg border border-line bg-background px-3 py-2 text-base";
  const stylists = me.preferredSalon && me.preferredSalon.id === salonId ? me.preferredSalon.stylists : [];

  return (
    <section className={card}>
      <h2 className="font-semibold">My salon &amp; stylist</h2>
      <p className="mt-0.5 text-sm text-muted">We&apos;ll show their openings first. You can always look wider.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          My salon
          <select className={`${sel} mt-1`} value={salonId} onChange={(e) => { setSalonId(e.target.value); setStaffId(""); }}>
            <option value="">None yet</option>
            {me.salons.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          My stylist
          <select className={`${sel} mt-1`} value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={!stylists.length}>
            <option value="">Anyone at the salon</option>
            {stylists.map((x) => <option key={x.id} value={x.id}>{x.name}{x.title ? ` · ${x.title}` : ""}</option>)}
          </select>
          {salonId && salonId !== me.preferredSalon?.id && <span className="text-xs text-muted">Save, then pick a stylist.</span>}
        </label>
        <label className="text-sm">
          Home ZIP or city
          <input className={`${sel} mt-1`} value={zip} onChange={(e) => setZip(e.target.value)} placeholder="36280 or Ranburne, AL" />
        </label>
        <label className="text-sm">
          Look within
          <select className={`${sel} mt-1`} value={miles} onChange={(e) => setMiles(Number(e.target.value))}>
            {[5, 10, 25, 50, 100].map((m) => <option key={m} value={m}>{m} miles</option>)}
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">Find another salon on <Link href="/find" className="underline">Find</Link>, then tap &ldquo;Make this my salon&rdquo; on its page.</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
      <button
        className={`${primary} mt-3`}
        disabled={pending}
        onClick={() => start(async () => {
          const r = await savePreferences({ businessId: salonId || null, staffId: staffId || null, zip, miles });
          setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
        })}
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </section>
  );
}

function Upcoming({ a, tz, policy, salonPhone, salon }: { a: PortalAppt; tz: string; policy: PortalData["policy"]; salonPhone: string | null; salon?: PortalData["salon"] | null }) {
  const [mode, setMode] = useState<"view" | "cancel" | "move">("view");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const day = wallParts(new Date(a.start), tz).date;
  const due = Math.max(0, a.depositRequired - a.depositPaid);

  return (
    <article className={card}>
      {salon && <p className="text-xs text-muted"><Link href={`/s/${salon.slug}`} className="underline">{salon.name}</Link></p>}
      <p className="font-semibold">{formatDay(day, { weekday: "long", month: "long", day: "numeric" })}</p>
      <p className="text-sm">{formatTimeRange(new Date(a.start), new Date(a.end), tz)}</p>
      <p className="mt-1 text-sm text-muted">{a.services.map((s) => s.name).join(", ")} · est. {money(a.total)}</p>
      {a.status === "pending" && due > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          Your time is held until your {money(due)} deposit arrives. <PayLinks text={a.payWith} />
        </p>
      )}
      {a.status !== "pending" && a.depositPaid > 0 && <p className="mt-1 text-xs text-muted">Deposit received: {money(a.depositPaid)}</p>}
      {a.status === "checked_in" && <p className="mt-1 text-sm font-semibold">You&apos;re checked in.</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}

      {mode === "view" && a.status !== "checked_in" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {a.canChange && <button className={btn} onClick={() => setMode("move")}>Change time</button>}
          <button className={btn} onClick={() => setMode("cancel")}>Cancel</button>
          {!a.canChange && (
            <p className="basis-full text-xs text-muted">
              It&apos;s within {policy.lateCancelWindowHours} hours, so changes need the salon{salonPhone ? <>: <a className="underline" href={`tel:${salonPhone.replace(/[^\d+]/g, "")}`}>{salonPhone}</a></> : "."}
            </p>
          )}
        </div>
      )}

      {mode === "cancel" && (
        <div className="mt-3 space-y-2 rounded-lg bg-background p-3 text-sm">
          {a.lateCancel ? (
            <p>
              <strong>This is a late cancellation</strong> (within {policy.lateCancelWindowHours} hours).{" "}
              {policy.lateCancelCharge === "full" ? `Per the salon's policy, the full ${money(a.total)} may be charged.` : "Per the salon's policy, a fee may be charged."} It also stays on your record.
            </p>
          ) : (
            <p>Cancel this appointment? You&apos;re outside the {policy.lateCancelWindowHours}-hour window, so there&apos;s no charge.</p>
          )}
          <div className="flex gap-2">
            <button
              className={primary}
              disabled={pending}
              onClick={() => start(async () => {
                const r = await portalCancel(a.id);
                setMsg(r.ok ? { ok: true, text: "Cancelled." } : { ok: false, text: r.error });
                setMode("view");
              })}
            >
              {pending ? "Cancelling…" : "Yes, cancel"}
            </button>
            <button className={btn} onClick={() => setMode("view")}>Keep it</button>
          </div>
        </div>
      )}

      {mode === "move" && <MovePicker a={a} tz={tz} onDone={(text) => { setMsg({ ok: true, text }); setMode("view"); }} onCancel={() => setMode("view")} />}
    </article>
  );
}

function MovePicker({ a, tz, onDone, onCancel }: { a: PortalAppt; tz: string; onDone: (text: string) => void; onCancel: () => void }) {
  const [dates, setDates] = useState<string[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [times, setTimes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    portalMoveOptions(a.id).then((r) => {
      if (!live) return;
      if (r.ok) setDates(r.dates.slice(0, 42));
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [a.id]);
  const pickDay = (d: string) => {
    setDate(d);
    setTimes(null);
    portalMoveOptions(a.id, d).then((r) => (r.ok ? setTimes(r.times) : setError(r.error)));
  };
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-background p-3 text-sm">
      <p className="font-semibold">Pick a new day</p>
      {dates === null && !error && <p className="text-muted">Loading…</p>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(dates ?? []).map((d) => (
          <button key={d} type="button" onClick={() => pickDay(d)} aria-pressed={date === d} className={`shrink-0 rounded-lg border px-3 py-2 ${date === d ? "border-foreground bg-foreground font-semibold text-background" : "border-line"}`}>
            <span className="block text-xs">{formatDay(d, { weekday: "short" })}</span>
            {formatDay(d, { month: "short", day: "numeric" })}
          </button>
        ))}
      </div>
      {date && (
        <>
          <p className="font-semibold">Open times ({tzAbbrev(zonedToUtc(date, 720, tz), tz)})</p>
          {times === null ? (
            <p className="text-muted">Loading…</p>
          ) : times.length === 0 ? (
            <p>No open times that day. Try another.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {times.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={pending}
                  className="rounded-lg border border-line px-2 py-2"
                  onClick={() => start(async () => {
                    const r = await portalMove(a.id, date, t);
                    if (r.ok) onDone(`Moved to ${formatDay(date, { weekday: "short", month: "short", day: "numeric" })} at ${formatMinutes(parseHHMM(t))}.`);
                    else setError(r.error);
                  })}
                >
                  {formatMinutes(parseHHMM(t))}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <button className={btn} onClick={onCancel}>Never mind</button>
    </div>
  );
}

function Contact({ phone, smsOptIn, email }: { phone: string; smsOptIn: boolean; email: string | null }) {
  const [p, setP] = useState(phone);
  const [texts, setTexts] = useState(smsOptIn);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className={card}>
      <h2 className="font-semibold">Your details</h2>
      <p className="mt-1 text-sm text-muted">Email: {email ?? "—"} (used to sign in)</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input className="rounded-lg border border-line bg-background px-3 py-2" inputMode="tel" placeholder="Mobile number" aria-label="Mobile number" value={p} onChange={(e) => setP(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={texts} onChange={(e) => setTexts(e.target.checked)} />
          Text me reminders
        </label>
        <button className={btn} disabled={pending} onClick={() => start(async () => { const r = await portalUpdateContact(p, texts); setMsg(r.ok ? "Saved." : r.error); })}>Save</button>
        {msg && <span role="status" className="text-sm">{msg}</span>}
      </div>
    </section>
  );
}

const APP: [RegExp, string][] = [
  [/venmo\.com/, "Venmo"],
  [/cash\.app/, "Cash App"],
  [/paypal\.me|paypal\.com/, "PayPal"],
];

/** "url or Zelle 256-555-0100" → tappable "Pay with Venmo" buttons plus plain instructions. */
function PayLinks({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      {text.split(" or ").map((part) =>
        /^https:\/\//.test(part) ? (
          <a key={part} href={part} target="_blank" rel="noreferrer" className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-semibold text-background">
            Pay with {APP.find(([re]) => re.test(part))?.[1] ?? "app"}
          </a>
        ) : (
          <span key={part}>{part}</span>
        ),
      )}
    </span>
  );
}
