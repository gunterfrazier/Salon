"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { PortalAppt, PortalData } from "@/lib/data/portal";
import { money } from "@/lib/format";
import { formatDay, formatMinutes, formatTimeRange, parseHHMM, tzAbbrev, wallParts, zoneLabel, zonedToUtc } from "@/lib/time/zone";
import { portalCancel, portalMove, portalMoveOptions, portalUpdateContact } from "./actions";

const card = "rounded-xl border border-line bg-surface p-4";
const btn = "rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50";
const primary = "rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50";

/** The client's own page: upcoming visits, changes within policy, balance, history. */
export default function MeView({ data }: { data: PortalData }) {
  const tz = data.salon.timezone;
  const c = data.client;
  // "Book again": the services from the last completed visit.
  const last = data.past.find((p) => p.status === "completed");
  const bookAgain = last ? `/book?services=${last.serviceIds.join(",")}` : "/book";

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-xs text-muted">{data.salon.name}</p>
            <p className="font-semibold">Hi, {c.firstName}</p>
          </div>
          <nav className="flex gap-1 text-sm">
            <Link href="/book" className="rounded-lg bg-foreground px-3 py-2 font-semibold text-background">Book</Link>
            <Link href="/account" className="rounded-lg px-3 py-2 hover:bg-background">Account</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        <p className="text-xs text-muted">Times are {zoneLabel(tz)}.</p>

        {data.balance > 0 && (
          <section className={card}>
            <h2 className="font-semibold">Balance due: {money(data.balance)}</h2>
            <p className="mt-1 text-sm">Please pay before your next visit. <PayLinks text={data.balancePayWith} /></p>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          {data.upcoming.length === 0 && (
            <p className={`${card} text-sm`}>
              Nothing booked.{" "}
              <Link href={bookAgain} className="underline">
                {last ? `Book ${last.services.join(", ")} again` : "Book a visit"}
              </Link>
            </p>
          )}
          {data.upcoming.map((a) => (
            <Upcoming key={a.id} a={a} tz={tz} policy={data.policy} salonPhone={data.salon.phone} />
          ))}
        </section>

        {data.past.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold">Past visits</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {data.past.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-x-3 py-2">
                  <span>
                    {formatDay(wallParts(new Date(p.start), tz).date, { month: "short", day: "numeric", year: "numeric" })} · {p.services.join(", ")}
                  </span>
                  <span className="text-muted">{p.status === "completed" ? money(p.total) : p.status === "cancelled" ? "Cancelled" : p.status === "no_show" ? "Missed" : ""}</span>
                </li>
              ))}
            </ul>
            {last && (
              <p className="mt-2 text-sm">
                <Link className="underline" href={bookAgain}>Book {last.services.join(", ")} again</Link>
              </p>
            )}
          </section>
        )}

        <Contact phone={c.phone ?? ""} smsOptIn={c.smsOptIn} email={c.email} />
      </main>
    </>
  );
}

function Upcoming({ a, tz, policy, salonPhone }: { a: PortalAppt; tz: string; policy: PortalData["policy"]; salonPhone: string | null }) {
  const [mode, setMode] = useState<"view" | "cancel" | "move">("view");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const day = wallParts(new Date(a.start), tz).date;
  const due = Math.max(0, a.depositRequired - a.depositPaid);

  return (
    <article className={card}>
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
