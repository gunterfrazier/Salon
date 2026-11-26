"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { StatusChip } from "@/components/StatusChip";
import type { CalAppointment, CalendarData } from "@/lib/data/calendar-types";
import { reviveClientState } from "@/lib/data/clients-shared";
import { duration, money } from "@/lib/format";
import { addDays, formatDateTime, formatDay, formatMinutes, formatTime, formatTimeRange, parseHHMM, toHHMM, tzAbbrev, wallParts, weekday, WEEKDAY_KEYS, zonedToUtc, zoneLabel } from "@/lib/time/zone";
import { clientChips, NEW_CLIENT_STATE } from "@/lib/ui/standing";
import type { StatusKey } from "@/lib/ui/status-colors";

type Chip = { status: StatusKey; text?: string };
type CloseKind = "checkout" | "cancel" | "no_show";
const OPEN_STATUSES = new Set(["pending", "booked", "confirmed", "checked_in", "in_service"]);
const STATUS_LABEL: Record<string, string> = { completed: "Completed", no_show: "No-show", cancelled: "Cancelled", pending: "Pending deposit" };
import { markDepositReceived } from "./actions";
import BookingSheet from "./BookingSheet";
import CheckoutSheet from "./CheckoutSheet";
import CloseSheet from "./CloseSheet";

const SNAP = 15;

function openWindow(data: CalendarData, date: string): [number, number] | null {
  const h = data.hours[WEEKDAY_KEYS[weekday(date)]];
  return h ? [parseHHMM(h[0]), parseHHMM(h[1])] : null;
}

export default function CalendarView({ data, focusDate }: { data: CalendarData; focusDate: string }) {
  const router = useRouter();
  const tz = data.timezone;
  const dates = useMemo(() => Array.from({ length: data.days }, (_, i) => addDays(data.from, i)), [data.from, data.days]);
  const pxPerMin = data.view === "week" ? 1 : 1.5;
  const [now, setNow] = useState<Date | null>(null);
  const [selected, setSelected] = useState<CalAppointment | null>(null);
  const [booking, setBooking] = useState<{ date: string; time: string } | null>(null);
  const [closing, setClosing] = useState<{ a: CalAppointment; kind: CloseKind } | null>(null);
  const done = () => {
    setClosing(null);
    setSelected(null);
    router.refresh();
  };

  useEffect(() => {
    // Client-only clock (avoids server/browser mismatch); refresh each minute.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Visible hours: business hours and any appointments, padded by an hour.
  const [startMin, endMin] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of dates) {
      const w = openWindow(data, d);
      if (w) [lo, hi] = [Math.min(lo, w[0]), Math.max(hi, w[1])];
    }
    for (const a of data.appointments) {
      if (!dates.includes(wallParts(new Date(a.start), tz).date)) continue;
      lo = Math.min(lo, wallParts(new Date(a.start), tz).minutes);
      const e = wallParts(new Date(a.end), tz);
      hi = Math.max(hi, e.minutes || 1440);
    }
    if (!Number.isFinite(lo)) [lo, hi] = [9 * 60, 17 * 60];
    return [Math.max(0, Math.floor(lo / 60) * 60 - 60), Math.min(1440, Math.ceil(hi / 60) * 60 + 60)];
  }, [dates, data, tz]);
  const height = (endMin - startMin) * pxPerMin;
  const hoursMarks = Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => startMin + i * 60);

  const prevDate = addDays(data.from, -data.days);
  const nextDate = addDays(data.from, data.days);
  const href = (date: string, view = data.view) => `/calendar?view=${view}&date=${date}`;
  const title =
    data.view === "day"
      ? formatDay(data.from, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : `${formatDay(dates[0], { month: "short", day: "numeric" })} – ${formatDay(dates[6], { month: "short", day: "numeric", year: "numeric" })}`;

  const chipsFor = (a: CalAppointment): Chip[] => {
    const st = data.clientStates[a.clientId];
    const { chips } = clientChips(st ? reviveClientState(st) : NEW_CLIENT_STATE, data.policy, now ?? new Date(a.start));
    if (a.depositRequired > 0) chips.push(a.depositPaid >= a.depositRequired ? { status: "deposit_paid" } : { status: "card_needed", text: `Deposit ${money(a.depositRequired)} due` });
    return chips;
  };

  function onColumnClick(e: React.MouseEvent<HTMLDivElement>, date: string) {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const m = Math.round((startMin + y / pxPerMin) / SNAP) * SNAP;
    setBooking({ date, time: toHHMM(Math.min(Math.max(m, 0), 1440 - SNAP)) });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link aria-label="Previous" href={href(prevDate)} className="rounded-lg border border-line bg-surface px-3 py-2">‹</Link>
          <Link href={href(data.today)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold">Today</Link>
          <Link aria-label="Next" href={href(nextDate)} className="rounded-lg border border-line bg-surface px-3 py-2">›</Link>
          <h1 className="ml-1 text-lg font-bold sm:text-xl">
            {title}
            <span className="block text-xs font-normal text-muted">{zoneLabel(tz, zonedToUtc(dates[0], 12 * 60, tz))}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-surface p-0.5 text-sm" role="group" aria-label="View">
            {(["day", "week"] as const).map((v) => (
              <Link
                key={v}
                href={href(focusDate, v)}
                aria-current={data.view === v ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 capitalize ${data.view === v ? "bg-foreground font-semibold text-background" : ""}`}
              >
                {v}
              </Link>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setBooking({ date: data.view === "day" ? data.from : focusDate, time: "" })}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent"
          >
            + New appointment
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
        <div className={data.view === "week" ? "min-w-[760px]" : ""}>
          {/* Day headers */}
          <div className="flex border-b border-line">
            <div className="flex w-14 shrink-0 items-end justify-end px-1 pb-2 text-[11px] font-semibold text-muted" title={zoneLabel(tz, zonedToUtc(dates[0], 12 * 60, tz))}>
              {tzAbbrev(zonedToUtc(dates[0], 12 * 60, tz), tz)}
            </div>
            {dates.map((d) => {
              const w = openWindow(data, d);
              const isToday = d === data.today;
              const label = (
                <span className={isToday ? "font-bold text-accent" : ""}>
                  {formatDay(d, { weekday: "short" })} {formatDay(d, { month: "numeric", day: "numeric" })}
                </span>
              );
              return (
                <div key={d} className="flex-1 border-l border-line px-2 py-2 text-sm">
                  {data.view === "week" ? <Link href={href(d, "day")} className="hover:underline">{label}</Link> : label}
                  <p className="text-xs text-muted">{w ? formatTimeRange(zonedToUtc(d, w[0], tz), zonedToUtc(d, w[1], tz), tz) : "Closed"}</p>
                </div>
              );
            })}
          </div>

          {/* Grid */}
          <div className="flex">
            <div className="relative w-14 shrink-0" style={{ height }}>
              {hoursMarks.slice(0, -1).map((m) => (
                <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: (m - startMin) * pxPerMin }}>
                  {m === startMin ? "" : formatMinutes(m)}
                </span>
              ))}
            </div>
            {dates.map((d) => {
              const w = openWindow(data, d);
              const dayAppts = data.appointments.filter((a) => wallParts(new Date(a.start), tz).date === d);
              // Appointments booked inside another's processing time get their own lane.
              const lanes = dayAppts.map((a, i) =>
                dayAppts.slice(0, i).filter((o) => new Date(o.start) < new Date(a.end) && new Date(a.start) < new Date(o.end)).length,
              );
              const nowWall = now ? wallParts(now, tz) : null;
              return (
                <div
                  key={d}
                  className="relative flex-1 cursor-copy border-l border-line bg-closed"
                  style={{ height }}
                  onClick={(e) => onColumnClick(e, d)}
                  aria-label={`${formatDay(d)}: tap an empty time to book`}
                >
                  {w && <div className="absolute inset-x-0 bg-surface" style={{ top: (w[0] - startMin) * pxPerMin, height: (w[1] - w[0]) * pxPerMin }} />}
                  {hoursMarks.map((m) => (
                    <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: (m - startMin) * pxPerMin }} />
                  ))}
                  {nowWall && nowWall.date === d && nowWall.minutes >= startMin && nowWall.minutes <= endMin && (
                    <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-600" style={{ top: (nowWall.minutes - startMin) * pxPerMin }} aria-hidden />
                  )}
                  {dayAppts.map((a, i) => (
                    <AppointmentBlock
                      key={a.id}
                      lane={lanes[i]}
                      a={a}
                      tz={tz}
                      top={(wallParts(new Date(a.start), tz).minutes - startMin) * pxPerMin}
                      pxPerMin={pxPerMin}
                      compact={data.view === "week"}
                      chips={chipsFor(a)}
                      onOpen={() => setSelected(a)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted">
        Tap an empty time to book it. <span className="processing-stripes inline-block h-3 w-6 rounded align-middle" /> striped = processing time, open for a short service.
      </p>

      {selected && !closing && (
        <AppointmentDetails a={selected} tz={tz} chips={chipsFor(selected)} data={data} now={now} onClose={() => setSelected(null)} onAction={(kind) => setClosing({ a: selected, kind })} onDepositDone={done} />
      )}
      {closing?.kind === "checkout" && <CheckoutSheet a={closing.a} data={data} onClose={() => setClosing(null)} onDone={done} />}
      {closing && closing.kind !== "checkout" && <CloseSheet a={closing.a} data={data} mode={closing.kind} onClose={() => setClosing(null)} onDone={done} />}
      {booking && (
        <BookingSheet
          data={data}
          initialDate={booking.date}
          initialTime={booking.time}
          onClose={() => setBooking(null)}
          onSaved={() => {
            setBooking(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function AppointmentBlock({
  a, tz, top, pxPerMin, compact, chips, onOpen, lane,
}: {
  a: CalAppointment; tz: string; top: number; pxPerMin: number; compact: boolean; lane: number;
  chips: Chip[];
  onOpen: () => void;
}) {
  const start = new Date(a.start).getTime();
  const end = new Date(a.end).getTime();
  const h = ((end - start) / 60000) * pxPerMin;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`processing-stripes appt-block absolute right-1 flex flex-col items-stretch justify-start overflow-hidden rounded-lg border-l-4 text-left ${OPEN_STATUSES.has(a.status) ? "" : "appt-done"}`}
      style={{ top, height: Math.max(h, 22), left: lane ? `${Math.min(25 + lane * 15, 60)}%` : 4, zIndex: 10 + lane }}
      aria-label={`${a.clientName}, ${formatTimeRange(new Date(a.start), new Date(a.end), tz)}`}
    >
      {a.busy.map((b, i) => (
        <span
          key={i}
          className="appt-busy absolute inset-x-0"
          style={{ top: ((new Date(b.start).getTime() - start) / 60000) * pxPerMin, height: ((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000) * pxPerMin }}
          aria-hidden
        />
      ))}
      <span className="relative block p-1.5 text-xs leading-tight">
        <span className="font-semibold">{a.clientName}</span>
        {(!OPEN_STATUSES.has(a.status) || a.status === "pending") && <span className="ml-1 text-[11px] font-semibold uppercase text-muted">· {STATUS_LABEL[a.status] ?? a.status}</span>}
        <span className="block text-muted">{formatTime(new Date(a.start), tz)} · {a.services.map((s) => s.name).join(" + ")}</span>
        {!compact && chips.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {chips.map((c, i) => <StatusChip key={i} status={c.status} text={c.text} size="sm" />)}
          </span>
        )}
        {compact && chips.length > 0 && <span className="mt-0.5 block">{chips.map((c, i) => <StatusChip key={i} status={c.status} text=" " size="sm" />)}</span>}
      </span>
    </button>
  );
}

function DepositReceived({ a, data, onDone }: { a: CalAppointment; data: CalendarData; onDone: () => void }) {
  const [amount, setAmount] = useState(((a.depositRequired - a.depositPaid) / 100).toFixed(2));
  const [method, setMethod] = useState("venmo_direct");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  return (
    <div className="mt-3 rounded-lg border border-line p-3 text-sm">
      <p className="font-semibold">Deposit received?</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-1">$<input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-line bg-background px-2 py-2" aria-label="Deposit amount received" /></label>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-line bg-background px-2 py-2" aria-label="Deposit method">
          {data.paymentMethods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" className="rounded-lg border border-line bg-background px-2 py-2" aria-label="Deposit reference" />
      </div>
      {error && <p className="mt-2 text-red-700 dark:text-red-300" role="alert">{error}</p>}
      <button
        disabled={saving}
        onClick={() =>
          start(async () => {
            const r = await markDepositReceived(a.id, Math.round(Number(amount) * 100), method, reference);
            if (r.ok) onDone();
            else setError(r.error);
          })
        }
        className="mt-2 rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent disabled:opacity-40"
      >
        {saving ? "Saving…" : "Mark deposit received"}
      </button>
    </div>
  );
}

function AppointmentDetails({
  a, tz, chips, data, now, onClose, onAction, onDepositDone,
}: {
  a: CalAppointment; tz: string; chips: Chip[];
  data: CalendarData; now: Date | null; onClose: () => void; onAction: (k: CloseKind) => void; onDepositDone: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const total = a.services.reduce((s, l) => s + l.finalPrice, 0);
  const st = data.clientStates[a.clientId];
  const history = st ? clientChips(reviveClientState(st), data.policy, now ?? new Date()).standing.history : [];
  const mins = (new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appt-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="appt-title" className="text-xl font-bold">{a.clientName}</h2>
            <p className="text-sm text-muted">
              {formatDay(wallParts(new Date(a.start), tz).date, { weekday: "long", month: "long", day: "numeric" })} · {formatTimeRange(new Date(a.start), new Date(a.end), tz)} ({duration(mins)})
            </p>
            <p className="text-sm">
              {a.clientPhone && <a className="underline" href={`tel:${a.clientPhone}`}>{a.clientPhone}</a>}
              {a.clientPhone && " · "}
              <Link className="underline" href={`/clients/${a.clientId}`}>View client</Link>
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl" aria-label="Close">×</button>
        </div>

        {chips.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{chips.map((c, i) => <StatusChip key={i} status={c.status} text={c.text} />)}</div>}

        {history.length > 0 && (
          <details className="mt-3 rounded-lg border border-line p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Violation history ({history.length})</summary>
            <ul className="mt-2 space-y-1">
              {history.map((h) => (
                <li key={h.flag.id}>
                  {h.flag.type === "no_show" ? "No-show" : "Late cancellation"} — {formatDateTime(h.flag.appointmentStart, tz)}
                  {h.flag.feeCharged ? ` · ${money(h.flag.feeCharged)} charged` : ""} ·{" "}
                  {h.state === "permanent" ? "permanent" : h.state === "active" ? `active${h.visitsRemaining !== null ? `, ${h.visitsRemaining} visits to clear` : ""}` : "cleared"}
                </li>
              ))}
            </ul>
          </details>
        )}

        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {a.services.map((s, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
              <span>
                {s.name}
                {s.discounts.map((d, j) => (
                  <span key={j} className="block text-xs text-muted">{d.label}: −{money(d.amount_cents)}</span>
                ))}
              </span>
              <span className="tabular-nums">
                {s.finalPrice !== s.listPrice && <s className="mr-1 text-muted">{money(s.listPrice)}</s>}
                {money(s.finalPrice)}
              </span>
            </li>
          ))}
          <li className="flex justify-between px-3 py-2 font-semibold">
            <span>Estimated total</span>
            <span className="tabular-nums">{money(total)}</span>
          </li>
        </ul>

        {a.depositRequired > 0 && (
          <p className="mt-3 text-sm">
            Deposit: {money(a.depositRequired)} — {a.depositPaid >= a.depositRequired ? "paid" : a.depositPaid > 0 ? `${money(a.depositPaid)} received` : "not received yet"}
            {a.status === "pending" && " · booking is pending until it arrives"}
          </p>
        )}
        {OPEN_STATUSES.has(a.status) && a.depositRequired > a.depositPaid && <DepositReceived a={a} data={data} onDone={onDepositDone} />}
        {a.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-background p-3 text-sm">{a.notes}</p>}
        {OPEN_STATUSES.has(a.status) ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => onAction("checkout")} className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-semibold text-on-accent">Check out</button>
            <button onClick={() => onAction("cancel")} className="rounded-lg border border-line px-4 py-2.5">Cancel</button>
            <button
              onClick={() => onAction("no_show")}
              disabled={!!now && now < new Date(a.start)}
              title={now && now < new Date(a.start) ? "Available once the appointment has started" : undefined}
              className="rounded-lg border border-line px-4 py-2.5 disabled:opacity-40"
            >
              No-show
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-background px-3 py-2 text-sm font-semibold">{STATUS_LABEL[a.status] ?? a.status}</p>
        )}
      </div>
    </div>
  );
}
