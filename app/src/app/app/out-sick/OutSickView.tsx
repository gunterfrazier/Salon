"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { affectedAppointments, endSickDay, markHandled, markOut, resendOffer } from "./actions";

export type SickDayCard = {
  id: string;
  who: string;
  days: string;
  reason: string | null;
  active: boolean;
  offers: { id: string; client: string; phone: string | null; was: string; status: string; outcome: string; link: string }[];
};
type Result = { ok: true; text: string } | { ok: false; error: string };

const input = "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-base";
const btn = "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50";
const STATUS: Record<string, string> = { open: "Waiting", rescheduled: "Rescheduled", cancelled: "Cancelled", handled: "Handled", expired: "No answer" };

export default function OutSickView({ me, today, people, days }: { me: string; today: string; people: { id: string; name: string }[]; days: SickDayCard[] }) {
  const router = useRouter();
  const [staffId, setStaffId] = useState(people.some((p) => p.id === me) ? me : (people[0]?.id ?? ""));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [preview, setPreview] = useState<{ id: string; when: string; client: string; services: string }[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const show = (r: Result) => setMsg(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.error });
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      show(r);
      if (r.ok) router.refresh();
    });
  const check = () =>
    start(async () => {
      const r = await affectedAppointments(staffId, from, to < from ? from : to);
      if (r.ok) setPreview(r.list);
      else show(r);
    });
  const who = people.find((p) => p.id === staffId);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Out sick</h1>
        <p className="text-sm text-muted">Takes the days off the schedule and gives each client a link to pick a new time{" "}(with you once you&rsquo;re back, or someone else at the salon if your salon allows it). Discounts and substitutes are set in Policies.</p>
      </header>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-line bg-surface" : "border-red-300 bg-red-50 font-semibold text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"}`}>{msg.text}</p>}

      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        {people.length > 1 && (
          <label className="block text-sm">
            Who&rsquo;s out
            <select className={input} value={staffId} onChange={(e) => { setStaffId(e.target.value); setPreview(null); }}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === me ? " (you)" : ""}</option>)}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            From
            <input type="date" className={input} min={today} value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); setPreview(null); }} />
          </label>
          <label className="block text-sm">
            Through
            <input type="date" className={input} min={from} value={to} onChange={(e) => { setTo(e.target.value); setPreview(null); }} />
          </label>
        </div>
        <label className="block text-sm">
          Note (only the salon sees it)
          <input className={input} value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Send each client their link now (text or email, per your message settings)
        </label>
        {!preview ? (
          <button className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50" disabled={pending || !staffId} onClick={check}>
            See affected appointments
          </button>
        ) : (
          <div className="space-y-3">
            {preview.length ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {preview.map((a) => (
                  <li key={a.id} className="px-3 py-2 text-sm">
                    <span className="font-medium">{a.when}</span> · {a.client}
                    <span className="block text-xs text-muted">{a.services}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No upcoming appointments those days.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await markOut({ staffId, from, to, reason, notify });
                    if (r.ok) setPreview(null);
                    return r;
                  })
                }
              >
                {preview.length ? `Mark ${who?.id === me ? "me" : who?.name.split(" ")[0]} out${notify ? ` and message ${preview.length} client${preview.length === 1 ? "" : "s"}` : ""}` : `Mark ${who?.id === me ? "me" : who?.name.split(" ")[0]} out`}
              </button>
              <button className={btn} disabled={pending} onClick={() => setPreview(null)}>Change</button>
            </div>
          </div>
        )}
      </section>

      {days.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Recent and upcoming</h2>
          {days.map((d) => (
            <article key={d.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{d.who} · {d.days}</p>
                  <p className="text-xs text-muted">{d.active ? "Off the schedule" : "Back on the schedule"}{d.reason ? ` · ${d.reason}` : ""}</p>
                </div>
                {d.active && <button className={btn} disabled={pending} onClick={() => confirm(`${d.who} is back? This puts them back on the schedule and closes links clients haven't used.`) && run(() => endSickDay(d.id))}>Back early</button>}
              </div>
              {d.offers.length ? (
                <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                  {d.offers.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{o.client}</span> · was {o.was}
                        <span className="block text-xs text-muted">{o.outcome}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.status === "rescheduled" ? "bg-accent/20" : o.status === "open" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : o.status === "expired" ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" : "bg-background text-muted"}`}>{STATUS[o.status] ?? o.status}</span>
                      {o.status === "open" && (
                        <span className="flex flex-wrap gap-1">
                          <button className={btn} disabled={pending} onClick={() => run(() => resendOffer(o.id))}>Send link</button>
                          <button
                            className={btn}
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(o.link);
                                setCopied(o.id);
                              } catch {
                                setMsg({ ok: true, text: o.link });
                              }
                            }}
                          >
                            {copied === o.id ? "Copied" : "Copy link"}
                          </button>
                          {o.phone && <a className={btn} href={`tel:${o.phone}`}>Call</a>}
                          <button className={btn} disabled={pending} onClick={() => run(() => markHandled(o.id))}>Handled</button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">No appointments were affected.</p>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
