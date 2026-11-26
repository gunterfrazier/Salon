import Link from "next/link";
import { money } from "@/lib/format";
import { change, type RangeKey, type Report } from "@/lib/reports/build";
import { addDays, formatDay, weekday } from "@/lib/time/zone";
import RevenueChart, { type Bucket } from "./RevenueChart";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
  { key: "last_year", label: "Last year" },
];

const METHOD: Record<string, string> = {
  cash: "Cash", venmo_direct: "Venmo", cash_app_direct: "Cash App", zelle: "Zelle", paypal_me: "PayPal", apple_cash: "Apple Cash", gift_card: "Gift card", other: "Other",
  card: "Card", google_pay: "Google Pay", apple_pay: "Apple Pay", cash_app_pay: "Cash App Pay", paypal: "PayPal", venmo: "Venmo",
};
const KIND: Record<string, string> = {
  service: "Services", tip: "Tips", deposit: "Deposits", cancel_fee: "Late-cancel fees", no_show_fee: "No-show fees", balance: "Balances paid", retail: "Retail", refund: "Refunds", gift_card: "Gift cards sold", package: "Packages sold",
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const percent = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function buckets(r: Report): { unit: string; list: Bucket[] } {
  if (r.days <= 31) {
    return { unit: "day", list: r.daily.map((d) => ({ label: String(Number(d.date.slice(8))), long: formatDay(d.date, { weekday: "short", month: "short", day: "numeric" }), collected: d.collected, visits: d.visits })) };
  }
  const monthly = r.days > 120;
  const map = new Map<string, Bucket>();
  for (const d of r.daily) {
    const key = monthly ? d.date.slice(0, 7) : addDays(d.date, -weekday(d.date));
    const b = map.get(key) ?? {
      label: monthly ? formatDay(`${key}-01`, { month: "short" }) : formatDay(key, { month: "numeric", day: "numeric" }),
      long: monthly ? formatDay(`${key}-01`, { month: "long", year: "numeric" }) : `Week of ${formatDay(key, { month: "short", day: "numeric" })}`,
      collected: 0,
      visits: 0,
    };
    b.collected += d.collected;
    b.visits += d.visits;
    map.set(key, b);
  }
  return { unit: monthly ? "month" : "week", list: [...map.values()] };
}

function Tile({ label, value, now, before, hint, good = "up" }: { label: string; value: string; now?: number; before?: number; hint?: string; good?: "up" | "down" }) {
  const c = now !== undefined && before !== undefined ? change(now, before) : null;
  const better = c === null ? null : good === "up" ? c >= 0 : c <= 0;
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {c !== null ? (
        <p className="text-xs">
          <span className={better ? "font-semibold" : ""}>
            {c >= 0 ? "▲" : "▼"} {Math.abs(Math.round(c * 100))}%
          </span>{" "}
          <span className="text-muted">vs previous period</span>
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

function Card({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: [string, string, string?][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([a, b, c]) => (
          <tr key={a} className="border-t border-line first:border-0">
            <td className="py-1.5">{a}</td>
            {c !== undefined && <td className="py-1.5 text-right text-muted tabular-nums">{c}</td>}
            <td className="py-1.5 text-right font-medium tabular-nums">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Small inline bar for "busiest" lists: one hue, value labeled in text. */
function Meter({ value, max }: { value: number; max: number }) {
  return (
    <span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-line align-middle sm:w-40" aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: "var(--chart-1)" }} />
    </span>
  );
}

export default function ReportView({ r, prev, range, zone, basePath = "/app/reports" }: { r: Report; prev: Report; range: RangeKey; zone: string; basePath?: string }) {
  const { unit, list } = buckets(r);
  const a = r.appointments;
  const maxDay = Math.max(...r.byWeekday.map((d) => d.visits));
  const maxHour = Math.max(0, ...r.byHour.map((h) => h.visits));
  const csv = (type: string) => `${basePath}/export?type=${type}&from=${r.from}&to=${r.to}`;
  const sameDay = r.from === r.to;
  const title = sameDay ? formatDay(r.from, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : `${formatDay(r.from, { month: "short", day: "numeric", year: "numeric" })} – ${formatDay(r.to, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted">
          {title} · {zone} · compared with the {r.days} day{r.days === 1 ? "" : "s"} before
        </p>
      </div>

      <nav aria-label="Date range" className="flex flex-wrap gap-2">
        {RANGES.map((x) => (
          <Link key={x.key} href={`${basePath}?range=${x.key}`} aria-current={range === x.key ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-sm ${range === x.key ? "bg-foreground font-semibold text-background" : "border border-line hover:bg-background"}`}>
            {x.label}
          </Link>
        ))}
        <form action={basePath} className="flex flex-wrap items-center gap-1 text-sm">
          <input type="hidden" name="range" value="custom" />
          <input type="date" name="from" defaultValue={r.from} aria-label="From" className="rounded-lg border border-line bg-background px-2 py-1" />
          <span>to</span>
          <input type="date" name="to" defaultValue={r.to} aria-label="To" className="rounded-lg border border-line bg-background px-2 py-1" />
          <button className="rounded-lg border border-line px-3 py-1.5">Go</button>
        </form>
      </nav>

      <section aria-label="Totals" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Money received" value={money(r.money.collected)} now={r.money.collected} before={prev.money.collected} />
        <Tile label="Service sales" value={money(r.money.serviceSales)} now={r.money.serviceSales} before={prev.money.serviceSales} hint="Completed visits" />
        <Tile label="Tips" value={money(r.money.tips)} now={r.money.tips} before={prev.money.tips} hint={r.money.tipPercent !== null ? `${percent(r.money.tipPercent)} of services` : undefined} />
        <Tile label="Visits" value={String(a.completed)} now={a.completed} before={prev.appointments.completed} />
        <Tile label="Average ticket" value={money(r.money.avgTicket)} now={r.money.avgTicket} before={prev.money.avgTicket} />
        <Tile label="New clients" value={String(r.clients.new)} now={r.clients.new} before={prev.clients.new} />
      </section>

      <RevenueChart buckets={list} unit={unit} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Appointments">
          <Rows
            rows={[
              ["Completed", String(a.completed)],
              ["Still booked", String(a.upcoming)],
              ["Waiting on a deposit", String(a.pending)],
              ["No-shows", String(a.noShows), percent(a.noShowRate)],
              ["Cancelled by client", String(a.cancelledByClient), percent(a.clientCancelRate)],
              ["Cancelled by you", String(a.cancelledByStylist)],
              ["Unpaid holds released", String(a.holdsReleased)],
              ["Booked online", String(a.online)],
              ["Booked by you", String(a.byStylist)],
            ]}
          />
        </Card>
        <Card title="Clients">
          <Rows
            rows={[
              ["Clients served", String(r.clients.served)],
              ["New", String(r.clients.new)],
              ["Returning", String(r.clients.returning)],
              ["Rebooked before leaving", String(r.clients.rebooked), percent(r.clients.rebookRate)],
              ["Owed to you now (all time)", money(r.money.balancesOwed)],
            ]}
          />
        </Card>
        <Card title="Money received by type">
          <Rows rows={Object.entries(r.money.byKind).sort((x, y) => y[1] - x[1]).map(([k, v]) => [KIND[k] ?? k, money(v)] as [string, string])} />
          {Object.keys(r.money.byKind).length === 0 && <p className="text-sm text-muted">Nothing received in this range.</p>}
          {r.money.giftCardsRedeemed > 0 && <p className="mt-2 text-sm text-muted">Also paid with gift cards: {money(r.money.giftCardsRedeemed)} (counted when the cards were sold).</p>}
        </Card>
        <Card title="By payment method">
          <Rows rows={r.money.byMethod.map((m) => [METHOD[m.method] ?? m.method, money(m.cents), `${m.count} payment${m.count === 1 ? "" : "s"}`] as [string, string, string])} />
          {r.money.byMethod.length === 0 && <p className="text-sm text-muted">Nothing received in this range.</p>}
        </Card>
        <Card title="Services" hint="Completed visits, final prices">
          <Rows rows={r.services.slice(0, 12).map((s) => [s.name, money(s.cents), `${s.count}×`] as [string, string, string])} />
          {r.services.length === 0 && <p className="text-sm text-muted">No completed visits in this range.</p>}
          {r.categories.length > 1 && (
            <p className="mt-2 text-xs text-muted">{r.categories.map((c) => `${c.category} ${money(c.cents)}`).join(" · ")}</p>
          )}
        </Card>
        <Card title="Busiest times" hint={`Visits, by day and start hour (${zone}). Chair time booked: ${percent(r.utilization)} of open hours.`}>
          <table className="w-full text-sm">
            <tbody>
              {r.byWeekday.filter((d) => d.visits > 0).map((d) => (
                <tr key={d.day}>
                  <td className="w-12 py-1">{WEEKDAYS[d.day]}</td>
                  <td className="py-1"><Meter value={d.visits} max={maxDay} /></td>
                  <td className="py-1 text-right tabular-nums">{d.visits}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {maxHour > 0 && (
            <table className="mt-3 w-full text-sm">
              <tbody>
                {r.byHour.map((h) => (
                  <tr key={h.hour}>
                    <td className="w-12 py-1">{((h.hour + 11) % 12) + 1} {h.hour < 12 ? "AM" : "PM"}</td>
                    <td className="py-1"><Meter value={h.visits} max={maxHour} /></td>
                    <td className="py-1 text-right tabular-nums">{h.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {maxDay === 0 && <p className="text-sm text-muted">No visits in this range.</p>}
        </Card>
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Download</h2>
        <p className="text-sm text-muted">Spreadsheet files (CSV) for this range, for your records or your tax preparer. Times are {zone}.</p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <a href={csv("appointments")} className="rounded-lg border border-line px-3 py-2">Appointments</a>
          <a href={csv("payments")} className="rounded-lg border border-line px-3 py-2">Payments</a>
          <a href={csv("services")} className="rounded-lg border border-line px-3 py-2">Services sold</a>
        </div>
      </section>
    </main>
  );
}
