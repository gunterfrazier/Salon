import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Business } from "../context";
import { buildReport, type RAppt, type Report, type RPayment } from "../reports/build";
import { isClosedDay, mergeHolidays } from "../schedule/holidays";
import { addDays, zonedToUtc } from "../time/zone";
import { parseRange } from "./calendar";
import { loadDaysOff } from "./schedule";

const PAGE = 1000;

/** Every row of a query, fetched 1,000 at a time (the API's page size). */
async function all<T>(make: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await make().range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

const chunks = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

interface ApptRow {
  id: string;
  client_id: string;
  start_at: string;
  end_at: string;
  status: string;
  booked_via: "online" | "stylist";
  created_at: string;
  cancelled_by: "client" | "stylist" | null;
  cancel_reason: string | null;
  clients: { first_name: string; last_name: string | null } | null;
  appointment_services: {
    sort: number;
    price_quoted_cents: number;
    services: { name: string; service_categories: { name: string } | null } | null;
    staff_busy_blocks: { during: string }[];
  }[];
}

export interface ReportRows {
  appts: (RAppt & { clientName: string })[];
  payments: (RPayment & { appointmentId: string | null; clientName: string; reference: string | null })[];
}

/** Raw rows for a date range (salon days, inclusive). Used by the report and the CSV export. */
export async function loadReportRows(db: SupabaseClient, b: Business, from: string, to: string): Promise<ReportRows> {
  const tz = b.timezone;
  const start = zonedToUtc(from, 0, tz).toISOString();
  const end = zonedToUtc(addDays(to, 1), 0, tz).toISOString();

  const [apptRows, payRows] = await Promise.all([
    all<ApptRow>(() =>
      db
        .from("appointments")
        .select(
          "id,client_id,start_at,end_at,status,booked_via,created_at,cancelled_by,cancel_reason,clients(first_name,last_name),appointment_services(sort,price_quoted_cents,services(name,service_categories(name)),staff_busy_blocks(during))",
        )
        .eq("business_id", b.id)
        .gte("start_at", start)
        .lt("start_at", end)
        .order("start_at")
        .order("id"),
    ),
    all<{ kind: string; method: string; amount_cents: number; created_at: string; status: string; appointment_id: string | null; external_reference: string | null; clients: { first_name: string; last_name: string | null } | null }>(() =>
      db
        .from("payments")
        .select("kind,method,amount_cents,created_at,status,appointment_id,external_reference,clients(first_name,last_name)")
        .eq("business_id", b.id)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at")
        .order("id"),
    ),
  ]);

  const name = (c: { first_name: string; last_name: string | null } | null) => [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Client";
  return {
    appts: apptRows.map((a) => {
      const lines = [...a.appointment_services].sort((x, y) => x.sort - y.sort);
      const busyMinutes = lines
        .flatMap((l) => l.staff_busy_blocks.map((bb) => parseRange(bb.during)))
        .reduce((n, r) => n + (new Date(r.end).getTime() - new Date(r.start).getTime()) / 60_000, 0);
      return {
        id: a.id,
        clientId: a.client_id,
        clientName: name(a.clients),
        start: new Date(a.start_at),
        end: new Date(a.end_at),
        status: a.status,
        bookedVia: a.booked_via,
        createdAt: new Date(a.created_at),
        cancelledBy: a.cancelled_by,
        cancelReason: a.cancel_reason,
        lines: lines.map((l) => ({ name: l.services?.name ?? "Service", category: l.services?.service_categories?.name ?? "Other", cents: l.price_quoted_cents })),
        // Cancelled/no-show appointments have their blocks removed; use the booked length for them.
        busyMinutes: busyMinutes || Math.round((new Date(a.end_at).getTime() - new Date(a.start_at).getTime()) / 60_000),
      };
    }),
    payments: payRows.map((p) => ({
      kind: p.kind,
      method: p.method,
      cents: p.amount_cents,
      at: new Date(p.created_at),
      status: p.status,
      appointmentId: p.appointment_id,
      clientName: name(p.clients),
      reference: p.external_reference,
    })),
  };
}

export async function loadReport(db: SupabaseClient, b: Business, from: string, to: string): Promise<Report> {
  const tz = b.timezone;
  const rows = await loadReportRows(db, b, from, to);
  const served = [...new Set(rows.appts.filter((a) => a.status === "completed").map((a) => a.clientId))];
  const start = zonedToUtc(from, 0, tz);

  const returning = new Set<string>();
  const bookingsMade: { clientId: string; createdAt: Date; start: Date; status: string }[] = [];
  for (const ids of chunks(served)) {
    const [imported, earlier, made] = await Promise.all([
      db.from("clients").select("id").in("id", ids).gt("prior_visit_count", 0),
      db.from("appointments").select("client_id").eq("business_id", b.id).in("client_id", ids).eq("status", "completed").lt("start_at", start.toISOString()),
      db.from("appointments").select("client_id,created_at,start_at,status").eq("business_id", b.id).in("client_id", ids).gte("created_at", new Date(start.getTime() - 86_400_000).toISOString()),
    ]);
    for (const r of [imported, earlier, made]) if (r.error) throw new Error(r.error.message);
    for (const c of imported.data ?? []) returning.add(c.id);
    for (const a of earlier.data ?? []) returning.add(a.client_id);
    for (const a of made.data ?? []) bookingsMade.push({ clientId: a.client_id, createdAt: new Date(a.created_at), start: new Date(a.start_at), status: a.status });
  }

  const { data: owed, error: owedErr } = await db.from("balances").select("amount_cents").eq("business_id", b.id).is("settled_payment_id", null);
  if (owedErr) throw new Error(owedErr.message);

  const daysOff = await loadDaysOff(db, b.id, start, zonedToUtc(addDays(to, 1), 0, tz));
  const rules = mergeHolidays(b.holidays);

  return buildReport({
    tz,
    from,
    to,
    hours: b.business_hours,
    isClosed: (d) => isClosedDay(d, tz, rules, daysOff),
    appts: rows.appts,
    payments: rows.payments,
    returningClientIds: returning,
    bookingsMade,
    balancesOwed: (owed ?? []).reduce((n, r) => n + r.amount_cents, 0),
  });
}
