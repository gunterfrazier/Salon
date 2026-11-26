import "server-only";
import type { getContext } from "../context";
import { menu } from "../menu";
import { addDays, todayIn, zonedToUtc } from "../time/zone";
import type { CalAppointment, CalendarData, CalClient } from "./calendar-types";
import { loadClientStates } from "./clients";
import { mergeHolidays } from "../schedule/holidays";
import { loadDaysOff } from "./schedule";

type Ctx = Awaited<ReturnType<typeof getContext>>;

/** Recorded-by-hand methods (no saved cards yet). Keys match the payment_method enum. */
export const MANUAL_METHODS = [
  { key: "cash", label: "Cash" },
  { key: "venmo_direct", label: "Venmo" },
  { key: "cash_app_direct", label: "Cash App" },
  { key: "zelle", label: "Zelle" },
  { key: "paypal_me", label: "PayPal" },
  { key: "apple_cash", label: "Apple Cash" },
  { key: "other", label: "Other / card" },
];

/** Postgres range text '["2026-12-01 21:00:00+00","2026-12-01 21:30:00+00")' → ISO pair. */
export function parseRange(r: string): { start: string; end: string } {
  const m = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(r.trim());
  if (!m) throw new Error(`Bad range: ${r}`);
  const iso = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
  return { start: iso(m[1]), end: iso(m[2]) };
}

type ApptRow = {
  id: string; client_id: string; start_at: string; end_at: string; status: string; notes: string | null; deposit_required_cents: number;
  clients: { first_name: string; last_name: string | null; phone: string | null } | null;
  appointment_services: {
    id: string; sort: number; list_price_cents: number; price_quoted_cents: number; discounts: { label: string; amount_cents: number }[];
    services: { name: string; price_type: string } | null; staff_busy_blocks: { phase: string; during: string }[];
  }[];
};

export async function loadCalendar(ctx: Ctx, opts: { from: string; view: "day" | "week" }): Promise<CalendarData> {
  const { supabase, business } = ctx;
  const tz = business.timezone;
  const days = opts.view === "week" ? 7 : 1;
  const rangeStart = zonedToUtc(opts.from, 0, tz).toISOString();
  const rangeEnd = zonedToUtc(addDays(opts.from, days), 0, tz).toISOString();

  const [appts, services, clients] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id,client_id,start_at,end_at,status,notes,deposit_required_cents,clients(first_name,last_name,phone),appointment_services(id,sort,list_price_cents,price_quoted_cents,discounts,services(name,price_type),staff_busy_blocks(phase,during))",
      )
      .eq("business_id", business.id)
      .lt("start_at", rangeEnd)
      .gt("end_at", rangeStart)
      .not("status", "in", "(cancelled)")
      .order("start_at"),
    supabase
      .from("services")
      .select(
        "id,key,name,price_type,price_cents,estimated_hours,active_min,processing_min,finish_min,deposit_category,stage,includes,is_add_on,bookable_online,sort,service_categories(name,sort)",
      )
      .eq("business_id", business.id)
      .eq("archived", false),
    supabase.from("clients").select("id,first_name,last_name,phone,email").eq("business_id", business.id).order("first_name").limit(5000),
  ]);
  for (const r of [appts, services, clients]) if (r.error) throw new Error(r.error.message);

  const rows = (appts.data ?? []) as unknown as ApptRow[];
  const apptIds = rows.map((a) => a.id);
  const paid: Record<string, number> = {};
  if (apptIds.length) {
    const { data: pays, error } = await supabase
      .from("payments")
      .select("appointment_id,amount_cents")
      .eq("business_id", business.id)
      .eq("kind", "deposit")
      .eq("status", "succeeded")
      .in("appointment_id", apptIds);
    if (error) throw new Error(error.message);
    for (const p of pays ?? []) paid[p.appointment_id] = (paid[p.appointment_id] ?? 0) + p.amount_cents;
  }

  const appointments: CalAppointment[] = rows.map((a) => {
    const lines = [...a.appointment_services].sort((x, y) => x.sort - y.sort);
    return {
      id: a.id,
      clientId: a.client_id,
      clientName: [a.clients?.first_name, a.clients?.last_name].filter(Boolean).join(" ") || "Client",
      clientPhone: a.clients?.phone ?? null,
      start: new Date(a.start_at).toISOString(),
      end: new Date(a.end_at).toISOString(),
      status: a.status,
      notes: a.notes,
      depositRequired: a.deposit_required_cents,
      depositPaid: paid[a.id] ?? 0,
      services: lines.map((l) => ({
        id: l.id,
        name: l.services?.name ?? "Service",
        priceType: l.services?.price_type ?? "fixed",
        listPrice: l.list_price_cents,
        finalPrice: l.price_quoted_cents,
        discounts: l.discounts ?? [],
      })),
      busy: lines
        .flatMap((l) => l.staff_busy_blocks.map((b) => ({ phase: b.phase, ...parseRange(b.during) })))
        .sort((x, y) => x.start.localeCompare(y.start)),
    };
  });

  type SvcRow = CalendarData["services"][number] & { service_categories: { name: string; sort: number } | null };
  const svcList = ((services.data ?? []) as unknown as SvcRow[])
    .map(({ service_categories, ...s }) => ({ ...s, category: service_categories?.name ?? "Other", categorySort: service_categories?.sort ?? 99 }))
    .sort((x, y) => x.categorySort - y.categorySort || x.sort - y.sort);

  const clientList: CalClient[] = (clients.data ?? []).map((c) => ({ id: c.id, firstName: c.first_name, lastName: c.last_name, phone: c.phone, email: c.email }));

  return {
    businessName: business.name,
    timezone: tz,
    hours: business.business_hours,
    policy: business.policy_settings,
    rules: business.pricing_rules.bundles ?? [],
    stages: menu.stages,
    view: opts.view,
    from: opts.from,
    days,
    today: todayIn(tz),
    appointments,
    clientStates: await loadClientStates(supabase, business.id, [...new Set(rows.map((a) => a.client_id))]),
    services: svcList,
    clients: clientList,
    paymentMethods: MANUAL_METHODS,
    holidays: mergeHolidays(business.holidays),
    daysOff: await loadDaysOff(
      supabase,
      business.id,
      new Date(Math.min(new Date(rangeStart).getTime(), Date.now())),
      new Date(Math.max(new Date(rangeEnd).getTime(), Date.now() + 400 * 86_400_000)),
    ),
  };
}
