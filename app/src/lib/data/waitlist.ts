import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WaitlistItem {
  id: string;
  clientId: string;
  clientName: string;
  phone: string | null;
  staffId: string | null;
  staffName: string | null;
  serviceIds: string[];
  serviceNames: string[];
  weekdays: number[];
  timeFrom: number;
  timeTo: number;
  dateFrom: string;
  dateTo: string;
  note: string | null;
  source: "staff" | "online";
  status: "active" | "booked" | "expired" | "removed";
  offers: number;
  lastOfferedAt: string | null;
  createdAt: string;
  closedAt: string | null;
}

type Row = {
  id: string;
  client_id: string;
  staff_id: string | null;
  service_ids: string[];
  weekdays: number[];
  time_from: number;
  time_to: number;
  date_from: string;
  date_to: string;
  note: string | null;
  source: "staff" | "online";
  status: WaitlistItem["status"];
  offers: number;
  last_offered_at: string | null;
  created_at: string;
  closed_at: string | null;
  clients: { first_name: string; last_name: string | null; phone: string | null } | null;
  staff: { display_name: string } | null;
};

/** Active entries plus those closed in the last 30 days, newest first. */
export async function loadWaitlist(db: SupabaseClient, businessId: string, opts: { clientIds?: string[] } = {}): Promise<WaitlistItem[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  let q = db
    .from("waitlist")
    .select("id,client_id,staff_id,service_ids,weekdays,time_from,time_to,date_from,date_to,note,source,status,offers,last_offered_at,created_at,closed_at,clients(first_name,last_name,phone),staff(display_name)")
    .eq("business_id", businessId)
    .or(`status.eq.active,closed_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (opts.clientIds) q = q.in("client_id", opts.clientIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  const ids = [...new Set(rows.flatMap((r) => r.service_ids))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: svc } = await db.from("services").select("id,name").in("id", ids);
    for (const s of svc ?? []) names.set(s.id, s.name);
  }
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: [r.clients?.first_name, r.clients?.last_name].filter(Boolean).join(" ") || "Client",
    phone: r.clients?.phone ?? null,
    staffId: r.staff_id,
    staffName: r.staff?.display_name ?? null,
    serviceIds: r.service_ids,
    serviceNames: r.service_ids.map((id) => names.get(id) ?? "Service"),
    weekdays: r.weekdays,
    timeFrom: r.time_from,
    timeTo: r.time_to,
    dateFrom: r.date_from,
    dateTo: r.date_to,
    note: r.note,
    source: r.source,
    status: r.status,
    offers: r.offers,
    lastOfferedAt: r.last_offered_at,
    createdAt: r.created_at,
    closedAt: r.closed_at,
  }));
}

/** Validate and normalize a new entry's fields. */
export function cleanEntry(req: { serviceIds: unknown; weekdays: unknown; timeFrom: unknown; timeTo: unknown; dateFrom: unknown; dateTo: unknown; note?: unknown }, today: string): { ok: true; v: { service_ids: string[]; weekdays: number[]; time_from: number; time_to: number; date_from: string; date_to: string; note: string | null } } | { ok: false; error: string } {
  const ids = Array.isArray(req.serviceIds) ? [...new Set(req.serviceIds.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)))] : [];
  if (!ids.length || ids.length > 8) return { ok: false, error: "Pick the services they're waiting for." };
  const weekdays = Array.isArray(req.weekdays) ? [...new Set(req.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  const from = Number(req.timeFrom), to = Number(req.timeTo);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > 1440 || to <= from) return { ok: false, error: "Pick a time window." };
  const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!isDate(req.dateFrom) || !isDate(req.dateTo)) return { ok: false, error: "Pick the dates." };
  const dateFrom = req.dateFrom < today ? today : req.dateFrom;
  if (req.dateTo < dateFrom) return { ok: false, error: "The last day is before the first day." };
  const days = (Date.parse(req.dateTo) - Date.parse(dateFrom)) / 86_400_000;
  if (days > 180) return { ok: false, error: "Keep it within six months." };
  const note = typeof req.note === "string" && req.note.trim() ? req.note.trim().slice(0, 300) : null;
  return { ok: true, v: { service_ids: ids, weekdays, time_from: from, time_to: to, date_from: dateFrom, date_to: req.dateTo, note } };
}
