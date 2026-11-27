"use client";

import { useEffect, useState, useTransition } from "react";
import type { CalAppointment, CalendarData } from "@/lib/data/calendar-types";
import { addDays, formatDay, formatMinutes, formatTimeRange, parseHHMM, tzAbbrev, wallParts, zonedToUtc } from "@/lib/time/zone";
import { moveAppointment, moveTimes, type BookingWarnings } from "./actions";
import { Sheet } from "./CloseSheet";

/** Move an upcoming appointment to another day/time, keeping its services and prices. */
export default function MoveSheet({ a, data, onClose, onDone }: { a: CalAppointment; data: CalendarData; onClose: () => void; onDone: () => void }) {
  const tz = data.timezone;
  const from = wallParts(new Date(a.start), tz).date;
  const [date, setDate] = useState(from);
  const [times, setTimes] = useState<string[] | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmClosed, setConfirmClosed] = useState(false);
  const [other, setOther] = useState(false);
  const [confirm, setConfirm] = useState<BookingWarnings | null>(null);
  const [saving, start] = useTransition();

  useEffect(() => {
    let live = true;
    moveTimes(a.id, date).then((r) => {
      if (!live) return;
      if (r.ok) {
        setTimes(r.times);
        setClosed(r.closed);
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [a.id, date]);

  const changeDate = (d: string) => {
    if (!d || d === date) return;
    setTimes(null);
    setTime(null);
    setError(null);
    setConfirmClosed(false);
    setDate(d);
  };

  const length = new Date(a.end).getTime() - new Date(a.start).getTime();
  const zone = tzAbbrev(zonedToUtc(date, 12 * 60, tz), tz);

  function save(ok: { outsideHours?: boolean; overlap?: boolean } = {}) {
    if (!time) return;
    setError(null);
    setConfirm(null);
    start(async () => {
      const r = await moveAppointment({ appointmentId: a.id, date, time, notifyClient: notify, confirmClosed, confirmOutsideHours: ok.outsideHours, confirmOverlap: ok.overlap });
      if (r.ok) onDone();
      else if (r.confirm) setConfirm(r.confirm);
      else setError(r.error);
    });
  }

  return (
    <Sheet
      title={`Move ${a.clientName}`}
      onClose={onClose}
      footer={
        <button disabled={!time || saving || (!!closed && !confirmClosed)} onClick={() => save()} className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-on-accent disabled:opacity-50">
          {saving ? "Moving…" : time ? `Move to ${formatDay(date, { weekday: "short", month: "short", day: "numeric" })}, ${formatMinutes(parseHHMM(time))} ${zone}` : "Pick a new time"}
        </button>
      }
    >
      <p className="text-sm text-muted">
        Now: {formatDay(from, { weekday: "long", month: "short", day: "numeric" })}, {formatTimeRange(new Date(a.start), new Date(a.end), tz)}. Services and prices stay the same.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => changeDate(addDays(date, -1))} className="rounded-lg border border-line px-3 py-2" aria-label="Previous day">‹</button>
        <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} className="rounded-lg border border-line bg-background px-3 py-2" aria-label="New date" />
        <button type="button" onClick={() => changeDate(addDays(date, 1))} className="rounded-lg border border-line px-3 py-2" aria-label="Next day">›</button>
        <span className="text-sm text-muted">{formatDay(date, { weekday: "long" })}</span>
      </div>

      {closed && (
        <label className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm">
          <input type="checkbox" checked={confirmClosed} onChange={(e) => setConfirmClosed(e.target.checked)} className="mt-1 size-4" />
          <span>
            <strong>Scheduled to be closed ({closed}).</strong> Move it to this day anyway?
          </span>
        </label>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">Open times ({zone})</p>
        {times === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : times.length === 0 ? (
          <p className="text-sm">No open times that fit {Math.round(length / 60000)} minutes this day. Try another day.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {times.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTime(t)}
                aria-pressed={time === t}
                className={`rounded-lg border px-2 py-2 text-sm ${time === t ? "border-accent bg-accent font-semibold text-on-accent" : "border-line"} ${date === from && t === wallTime(a.start, tz) ? "opacity-50" : ""}`}
                disabled={date === from && t === wallTime(a.start, tz)}
                title={date === from && t === wallTime(a.start, tz) ? "Current time" : undefined}
              >
                {formatMinutes(parseHHMM(t))}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <button type="button" className="text-sm underline" onClick={() => setOther(!other)} aria-expanded={other}>
          {other ? "Hide other time" : "Other time (outside hours or double-book)"}
        </button>
        {other && (
          <label className="mt-2 block max-w-xs text-sm">
            <span className="text-muted">Start time ({zone})</span>
            <input type="time" step={300} className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2" value={time ?? ""} onChange={(e) => setTime(e.target.value || null)} />
            {!data.can.override && <span className="mt-1 block text-xs text-muted">Your access only allows open times.</span>}
          </label>
        )}
      </div>

      {confirm && (
        <div role="alertdialog" aria-labelledby="mv-ovr" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p id="mv-ovr" className="font-semibold">{confirm.overlap && confirm.outsideHours ? "Outside hours and double-booked" : confirm.overlap ? "This double-books" : "Outside working hours"}</p>
          {confirm.outsideHours && <p className="mt-1">{confirm.outsideHours}</p>}
          {confirm.overlap && <p className="mt-1">{confirm.overlap}</p>}
          {data.can.override ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="rounded-lg bg-accent px-3 py-2 font-semibold text-on-accent" onClick={() => save({ outsideHours: !!confirm.outsideHours, overlap: !!confirm.overlap })}>Move anyway</button>
              <button type="button" className="rounded-lg border border-line px-3 py-2" onClick={() => setConfirm(null)}>Pick another time</button>
            </div>
          ) : (
            <p className="mt-1 font-semibold">Your access doesn&rsquo;t allow this. Pick an open time.</p>
          )}
        </div>
      )}

      <label className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-1 size-4" />
        <span>
          <span className="font-semibold">Let the client know</span>
          <span className="block text-sm text-muted">Sends the &ldquo;appointment changed&rdquo; message. Reminders follow the new time automatically.</span>
        </span>
      </label>

      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
    </Sheet>
  );
}

function wallTime(iso: string, tz: string) {
  const p = wallParts(new Date(iso), tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
