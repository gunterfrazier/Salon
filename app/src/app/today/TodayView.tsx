import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import { duration, money } from "@/lib/format";
import type { Agenda } from "@/lib/today/agenda";
import { addDays, formatDay, formatTime, formatTimeRange, zoneLabel } from "@/lib/time/zone";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending deposit",
  completed: "Checked out",
  no_show: "No-show",
  checked_in: "Checked in",
  in_service: "In chair",
};

/** The day at a glance: who's coming, what they're having, what's owed, and open time. */
export default function TodayView({
  agenda, today, timezone, closureLabel, basePath = "/today", supply = {}, stylists = [], viewStaff = null, staffNames = null,
}: {
  agenda: Agenda; today: string; timezone: string; closureLabel: string | null; basePath?: string; supply?: Record<string, string[]>;
  /** Whose day to show (owners/managers with several stylists). */
  stylists?: { id: string; name: string }[];
  viewStaff?: string | null;
  /** Show the stylist on each row (everyone's day). */
  staffNames?: Record<string, string> | null;
}) {
  const who = viewStaff ?? "all";
  const q = (d: string) => `${basePath}?date=${d}${stylists.length > 1 ? `&staff=${who}` : ""}`;
  const tz = timezone;
  const { date, items, gaps, summary } = agenda;
  const label = date === today ? "Today" : date === addDays(today, 1) ? "Tomorrow" : date === addDays(today, -1) ? "Yesterday" : formatDay(date, { weekday: "long" });
  const nav = (d: string, text: string) => (
    <Link href={q(d)} className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-background">
      {text}
    </Link>
  );

  // Interleave open gaps with appointments, in time order.
  const rows: ({ kind: "appt"; i: (typeof items)[number] } | { kind: "gap"; g: (typeof gaps)[number] })[] = [
    ...items.map((i) => ({ kind: "appt" as const, i, t: i.appt.start })),
    ...gaps.map((g) => ({ kind: "gap" as const, g, t: g.start.toISOString() })),
  ].sort((a, b) => a.t.localeCompare(b.t));

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{label}</h1>
          <p className="text-sm text-muted">
            {formatDay(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · {zoneLabel(tz, new Date(`${date}T18:00:00Z`))}
          </p>
        </div>
        {stylists.length > 1 && (
          <nav aria-label="Whose day" className="flex w-full flex-wrap gap-2 text-sm">
            {[{ id: "all", name: "Everyone" }, ...stylists].map((s) => (
              <Link key={s.id} href={`${basePath}?date=${date}&staff=${s.id}`} aria-current={who === s.id ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${who === s.id ? "bg-foreground font-semibold text-background" : "border border-line"}`}>
                {s.name.split(" ")[0]}
              </Link>
            ))}
          </nav>
        )}
        <nav aria-label="Day" className="flex flex-wrap gap-2">
          {nav(addDays(date, -1), "‹ Previous")}
          {date !== today && nav(today, "Today")}
          {nav(addDays(date, 1), "Next ›")}
          <Link href={`/calendar?date=${date}`} className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-background">
            Open in calendar
          </Link>
          <Link href="/kiosk" className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-background">
            Check-in kiosk
          </Link>
        </nav>
      </div>

      <section aria-label="Summary" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Appointments" value={String(summary.count)} />
        <Stat label="Expected" value={money(summary.expected)} />
        <Stat label="Deposits due" value={summary.depositsDue ? money(summary.depositsDue) : "None"} warn={summary.depositsDue > 0} />
        <Stat label="Booked time" value={summary.bookedMinutes ? duration(summary.bookedMinutes) : "—"} />
      </section>
      {(summary.newClients > 0 || summary.flagged > 0) && (
        <p className="mt-2 text-sm">
          {summary.newClients > 0 && <span>{summary.newClients} new client{summary.newClients === 1 ? "" : "s"}. </span>}
          {summary.flagged > 0 && <span className="font-semibold">{summary.flagged} flagged client{summary.flagged === 1 ? "" : "s"} — check before they arrive.</span>}
        </p>
      )}

      {agenda.closed && (
        <p className="mt-4 rounded-xl border border-line bg-surface p-3 text-sm">
          <strong>Closed{closureLabel ? `: ${closureLabel}` : ""}.</strong> {items.length ? "These appointments were booked anyway." : "Nothing booked."}
        </p>
      )}
      {!agenda.closed && agenda.open && agenda.close && <p className="mt-4 text-sm text-muted">Open {formatTimeRange(agenda.open, agenda.close, tz)}</p>}

      <ol className="mt-2 space-y-2">
        {rows.map((r) =>
          r.kind === "gap" ? (
            <li key={`g-${r.g.start.toISOString()}`} className="rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted">
              Open {formatTimeRange(r.g.start, r.g.end, tz)} · {duration(r.g.minutes)}
              <Link href={`/calendar?date=${date}`} className="ml-2 underline">
                Book
              </Link>
            </li>
          ) : (
            <AgendaRow key={r.i.appt.id} item={r.i} tz={tz} date={date} supply={supply[r.i.appt.id] ?? []} stylist={staffNames?.[r.i.appt.staffId] ?? null} />
          ),
        )}
        {rows.length === 0 && !agenda.closed && <li className="rounded-xl border border-line bg-surface p-4 text-sm">Nothing booked yet.</li>}
      </ol>
    </main>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border bg-surface p-3 ${warn ? "border-foreground" : "border-line"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function AgendaRow({ item, tz, date, supply, stylist }: { item: Agenda["items"][number]; tz: string; date: string; supply: string[]; stylist: string | null }) {
  const a = item.appt;
  const start = new Date(a.start);
  const phone = a.clientPhone?.replace(/[^\d+]/g, "");
  return (
    <li className={`rounded-xl border bg-surface p-3 ${item.when === "now" ? "border-foreground border-2" : "border-line"} ${item.when === "done" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-semibold">
          {formatTime(start, tz)}
          {item.when === "now" && <span className="ml-2 text-xs font-semibold uppercase">· Now</span>}
          {STATUS_LABEL[a.status] && <span className="ml-2 text-xs font-semibold uppercase text-muted">· {STATUS_LABEL[a.status]}</span>}
        </p>
        <p className="text-sm text-muted">
          until {formatTime(new Date(a.end), tz)} · {money(item.total)}
        </p>
      </div>
      <p className="mt-1">
        <Link href={`/clients/${a.clientId}`} className="font-semibold underline">
          {a.clientName}
        </Link>
        {stylist && <span className="text-sm text-muted"> with {stylist.split(" ")[0]}</span>}
        <span className="text-muted"> — {a.services.map((s) => s.name).join(", ")}</span>
      </p>
      {item.chips.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {item.chips.map((c, i) => (
            <StatusChip key={i} status={c.status} text={c.text} size="sm" />
          ))}
        </div>
      )}
      {a.notes && <p className="mt-1 text-sm">Note: {a.notes}</p>}
      {supply.map((w) => (
        <p key={w} className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">Stock: {w}</p>
      ))}
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <Link href={`/calendar?date=${date}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-background">
          Details
        </Link>
        {phone && (
          <>
            <a href={`tel:${phone}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-background">
              Call
            </a>
            <a href={`sms:${phone}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-background">
              Text
            </a>
          </>
        )}
      </div>
    </li>
  );
}
