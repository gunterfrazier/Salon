import "server-only";
import { isInsideWindow } from "../policy/engine";
import type { PolicySettings } from "../policy/types";
import { cleanFavorites, type Favorites } from "../booking/search";
import { createAdminClient } from "../supabase/admin";
import { payLine } from "../notify/outbox";
import type { StoredMethods } from "../payments/settings";

const OPEN = ["pending", "booked", "confirmed", "checked_in"];

export interface PortalAppt {
  id: string;
  start: string;
  end: string;
  status: string;
  services: { serviceId: string; name: string; cents: number }[];
  total: number;
  depositRequired: number;
  depositPaid: number;
  /** Where to send an unpaid deposit. */
  payWith: string | null;
  /** Client may still change it themselves (outside the late-cancel window). */
  canChange: boolean;
  /** Cancelling now counts as a late cancellation. */
  lateCancel: boolean;
}

export interface PortalData {
  salon: { id: string; slug: string; name: string; timezone: string; phone: string | null };
  client: { id: string; firstName: string; lastName: string | null; phone: string | null; email: string | null; smsOptIn: boolean; favorites: Favorites | null };
  upcoming: PortalAppt[];
  past: { id: string; start: string; status: string; services: string[]; serviceIds: string[]; total: number }[];
  balance: number;
  balancePayWith: string | null;
  policy: { lateCancelWindowHours: number; lateCancelCharge: string };
}

/** Everything the client portal shows, for one client. Read with the service key; always scoped to this client. */
export async function loadPortal(clientId: string, businessId: string, now = new Date()): Promise<PortalData | null> {
  const db = createAdminClient();
  const [{ data: b }, { data: c }, { data: appts }, { data: bal }, { data: owner }] = await Promise.all([
    db.from("businesses").select("id,slug,name,timezone,phone,policy_settings,payment_methods").eq("id", businessId).single(),
    db.from("clients").select("id,first_name,last_name,phone,email,sms_opt_in,preferences").eq("id", clientId).eq("business_id", businessId).single(),
    db
      .from("appointments")
      .select("id,start_at,end_at,status,deposit_required_cents,appointment_services(sort,service_id,price_quoted_cents,services(name)),payments(kind,amount_cents,status)")
      .eq("business_id", businessId)
      .eq("client_id", clientId)
      .order("start_at", { ascending: false })
      .limit(60),
    db.from("balances").select("amount_cents").eq("client_id", clientId).is("settled_payment_id", null),
    db.from("staff").select("phone").eq("business_id", businessId).eq("role", "owner").eq("active", true).limit(1),
  ]);
  if (!b || !c) return null;
  const policy = b.policy_settings as PolicySettings;

  type Row = {
    id: string; start_at: string; end_at: string; status: string; deposit_required_cents: number;
    appointment_services: { sort: number; service_id: string; price_quoted_cents: number; services: { name: string } | null }[];
    payments: { kind: string; amount_cents: number; status: string }[];
  };
  const rows = (appts ?? []) as unknown as Row[];
  const shape = (a: Row) => {
    const services = [...a.appointment_services].sort((x, y) => x.sort - y.sort).map((l) => ({ serviceId: l.service_id, name: l.services?.name ?? "Service", cents: l.price_quoted_cents }));
    const paid = a.payments.filter((p) => p.kind === "deposit" && p.status === "succeeded").reduce((n, p) => n + p.amount_cents, 0);
    return { services, total: services.reduce((n, s) => n + s.cents, 0), depositPaid: paid };
  };

  const upcoming = rows
    .filter((a) => OPEN.includes(a.status) && new Date(a.end_at) > now)
    .reverse()
    .map((a): PortalAppt => {
      const s = shape(a);
      const due = Math.max(0, a.deposit_required_cents - s.depositPaid);
      const late = isInsideWindow(new Date(a.start_at), now, policy);
      return {
        id: a.id,
        start: a.start_at,
        end: a.end_at,
        status: a.status,
        services: s.services,
        total: s.total,
        depositRequired: a.deposit_required_cents,
        depositPaid: s.depositPaid,
        payWith: due > 0 ? payLine(b.payment_methods as StoredMethods, due, `Deposit ${c.first_name}`) : null,
        canChange: !late && a.status !== "checked_in",
        lateCancel: late,
      };
    });
  const past = rows
    .filter((a) => !OPEN.includes(a.status) || new Date(a.end_at) <= now)
    .slice(0, 20)
    .map((a) => {
      const s = shape(a);
      return { id: a.id, start: a.start_at, status: a.status, services: s.services.map((x) => x.name), serviceIds: s.services.map((x) => x.serviceId), total: s.total };
    });
  const balance = (bal ?? []).reduce((n, r) => n + r.amount_cents, 0);

  return {
    salon: { id: b.id, slug: b.slug, name: b.name, timezone: b.timezone, phone: b.phone ?? owner?.[0]?.phone ?? null },
    client: { id: c.id, firstName: c.first_name, lastName: c.last_name, phone: c.phone, email: c.email, smsOptIn: !!c.sms_opt_in, favorites: cleanFavorites(c.preferences) },
    upcoming,
    past,
    balance,
    balancePayWith: balance > 0 ? payLine(b.payment_methods as StoredMethods, balance, `Balance ${c.first_name}`) : null,
    policy: { lateCancelWindowHours: policy.lateCancelWindowHours, lateCancelCharge: policy.fees.lateCancel.defaultCharge },
  };
}
