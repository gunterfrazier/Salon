"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { nextOccurrence, type DayOff, type HolidayDate, type HolidayRule } from "@/lib/schedule/holidays";
import { addDays, formatDay, formatTimeRange, wallParts, zoneLabel } from "@/lib/time/zone";
import { addCustomHoliday, addTimeOff, deleteCustomHoliday, deleteTimeOff, setHolidayClosed } from "./actions";

const input = "rounded-lg border border-line bg-background px-3 py-2.5 text-base";
const card = "rounded-xl border border-line bg-surface p-4";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NTH: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", [-1]: "Last" };

function describe(d: HolidayDate): string {
  if (d.type === "fixed") return `${MONTHS[d.month - 1]} ${d.day}`;
  if (d.type === "nth") return `${NTH[d.n]} ${WEEKDAYS[d.weekday]} of ${MONTHS[d.month - 1]}${d.plusDays ? ` + ${d.plusDays} day` : ""}`;
  return d.offset === 0 ? "Easter Sunday" : `${Math.abs(d.offset)} days ${d.offset < 0 ? "before" : "after"} Easter`;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        after?.();
        router.refresh();
      } else setError(r.error ?? "Something went wrong.");
    });
  };
  return { run, pending, error };
}

export default function ScheduleSettings({
  businessName, timezone, today, holidays, daysOff,
}: {
  businessName: string; timezone: string; today: string; holidays: HolidayRule[]; daysOff: DayOff[];
}) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Schedule</h1>
        <p className="mt-1 text-muted">
          Holidays and days off. Clients can&rsquo;t book online when {businessName} is closed. You can still book those days yourself after confirming.
        </p>
        <p className="mt-1 text-xs text-muted">Times in {zoneLabel(timezone)}</p>
      </div>
      <Holidays holidays={holidays} today={today} />
      <DaysOff daysOff={daysOff} timezone={timezone} today={today} />
    </main>
  );
}

function Holidays({ holidays, today }: { holidays: HolidayRule[]; today: string }) {
  const { run, pending, error } = useRun();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"fixed" | "nth">("fixed");
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const [n, setN] = useState(1);
  const [weekday, setWeekday] = useState(1);

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Holidays</h2>
        {!adding && <button className="rounded-lg border border-line px-3 py-2 text-sm" onClick={() => setAdding(true)}>+ Add holiday</button>}
      </div>
      <p className="text-sm text-muted">Closed holidays repeat every year.</p>

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg bg-background p-3">
          <input className={`${input} w-full`} placeholder="Name, e.g. Salon anniversary" aria-label="Holiday name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={kind === "fixed"} onChange={() => setKind("fixed")} className="size-4 accent-[var(--accent)]" />Same date every year</label>
            <label className="flex items-center gap-2"><input type="radio" checked={kind === "nth"} onChange={() => setKind("nth")} className="size-4 accent-[var(--accent)]" />A weekday of a month</label>
          </div>
          <div className="flex flex-wrap gap-2">
            {kind === "nth" && (
              <>
                <select className={input} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Which week">
                  {[1, 2, 3, 4, -1].map((x) => <option key={x} value={x}>{NTH[x]}</option>)}
                </select>
                <select className={input} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} aria-label="Weekday">
                  {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
                </select>
                <span className="self-center text-sm">of</span>
              </>
            )}
            <select className={input} value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Month">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            {kind === "fixed" && (
              <select className={input} value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Day">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button className="px-3 text-sm" onClick={() => setAdding(false)}>Cancel</button>
            <button
              disabled={pending || !name.trim()}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-40"
              onClick={() =>
                run(
                  () => addCustomHoliday(name, kind === "fixed" ? { type: "fixed", month, day } : { type: "nth", month, weekday, n }),
                  () => { setAdding(false); setName(""); },
                )
              }
            >
              Add holiday
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}

      <ul className="mt-3 divide-y divide-line">
        {holidays.map((h) => {
          const next = nextOccurrence(h, today);
          return (
            <li key={h.key} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="font-semibold">{h.name}</span>
                <span className="block text-sm text-muted">
                  {describe(h.date)}{next ? ` · next ${formatDay(next, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {h.custom && (
                  <button className="text-xs text-muted underline" disabled={pending} onClick={() => confirm(`Delete ${h.name}?`) && run(() => deleteCustomHoliday(h.key))}>
                    Delete
                  </button>
                )}
                <button
                  role="switch"
                  aria-checked={h.closed}
                  aria-label={`${h.name}: ${h.closed ? "closed" : "open"}`}
                  disabled={pending}
                  onClick={() => run(() => setHolidayClosed(h.key, !h.closed))}
                  className={`min-w-[5.5rem] rounded-full px-3 py-1.5 text-sm font-semibold ${h.closed ? "bg-red-700 text-white dark:bg-red-600" : "border border-line text-muted"}`}
                >
                  {h.closed ? "Closed" : "Open"}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DaysOff({ daysOff, timezone, today }: { daysOff: DayOff[]; timezone: string; today: string }) {
  const { run, pending, error } = useRun();
  const [kind, setKind] = useState<"days" | "hours">("days");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");

  const describeOff = (o: DayOff) => {
    const s = new Date(o.start);
    const e = new Date(o.end);
    if (o.allDay) {
      const first = wallParts(s, timezone).date;
      const last = addDays(wallParts(e, timezone).date, -1);
      const f = (d: string) => formatDay(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      return first === last ? `${f(first)} (all day)` : `${f(first)} – ${f(last)}`;
    }
    return `${formatDay(wallParts(s, timezone).date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}, ${formatTimeRange(s, e, timezone)}`;
  };

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Days off &amp; blocked time</h2>
      <p className="text-sm text-muted">Vacations, appointments, anything that isn&rsquo;t a yearly holiday.</p>

      <div className="mt-3 space-y-2 rounded-lg bg-background p-3">
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={kind === "days"} onChange={() => setKind("days")} className="size-4 accent-[var(--accent)]" />Whole day(s)</label>
          <label className="flex items-center gap-2"><input type="radio" checked={kind === "hours"} onChange={() => setKind("hours")} className="size-4 accent-[var(--accent)]" />Part of a day</label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" className={input} value={startDate} min={today} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} aria-label={kind === "days" ? "First day off" : "Date"} />
          {kind === "days" ? (
            <>
              <span>to</span>
              <input type="date" className={input} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} aria-label="Last day off" />
            </>
          ) : (
            <>
              <input type="time" step={900} className={input} value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="From" />
              <span>to</span>
              <input type="time" step={900} className={input} value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="Until" />
            </>
          )}
        </div>
        <input className={`${input} w-full`} placeholder="Reason (optional, e.g. Vacation)" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end">
          <button
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-40"
            onClick={() => run(() => addTimeOff({ kind, startDate, endDate, startTime, endTime, reason }), () => setReason(""))}
          >
            {kind === "days" ? "Block day(s)" : "Block time"}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}

      <ul className="mt-3 divide-y divide-line">
        {daysOff.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span>
              <span className="font-semibold">{o.reason || (o.allDay ? "Day off" : "Blocked time")}</span>
              <span className="block text-muted">{describeOff(o)}</span>
            </span>
            <button className="text-xs text-muted underline" disabled={pending} onClick={() => run(() => deleteTimeOff(o.id))}>Remove</button>
          </li>
        ))}
        {daysOff.length === 0 && <li className="py-2.5 text-sm text-muted">Nothing blocked.</li>}
      </ul>
    </section>
  );
}
