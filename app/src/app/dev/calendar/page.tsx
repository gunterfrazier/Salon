import { notFound } from "next/navigation";
import CalendarView from "@/app/app/calendar/CalendarView";
import { buildBooking, type BookableService } from "@/lib/booking/build";
import { MANUAL_METHODS } from "@/lib/data/calendar";
import type { CalAppointment, CalendarData } from "@/lib/data/calendar-types";
import { menu, servicesByKey } from "@/lib/menu";
import type { PolicySettings } from "@/lib/policy/types";
import type { BundleRule } from "@/lib/pricing/discounts";
import { isDateStr, parseHHMM, startOfWeek, zonedToUtc } from "@/lib/time/zone";
import { NEW_CLIENT_STATE } from "@/lib/ui/standing";
import { mergeHolidays } from "@/lib/schedule/holidays";
import policyJson from "../../../../seed/policies.json";
import rulesJson from "../../../../seed/pricing-rules.json";
import menuJson from "../../../../seed/service-menu.json";

/** Development-only preview of the calendar with sample data (404 in production). */
export const dynamic = "force-dynamic";

const TZ = "America/Chicago";
const policy = policyJson as unknown as PolicySettings;
const rules = rulesJson.bundles as BundleRule[];
const svc = (k: string): BookableService => ({ ...servicesByKey[k], id: k });

function appt(id: string, clientId: string, name: string, date: string, time: string, keys: string[], deposit = 0, paid = 0): CalAppointment {
  const r = buildBooking({ services: keys.map(svc), start: zonedToUtc(date, parseHHMM(time), TZ), rules, policy, client: NEW_CLIENT_STATE, now: new Date() });
  return {
    id, staffId: "s1", clientId, clientName: name, clientPhone: "(555) 010-0100", start: r.payload.start_at, end: r.payload.end_at, status: "booked", notes: null,
    depositRequired: deposit, depositPaid: paid,
    services: r.priced.lines.map((l, i) => ({ id: `${id}-${i}`, serviceId: keys[i], name: l.name, priceType: servicesByKey[keys[i]].priceType, listPrice: l.listPrice, finalPrice: l.finalPrice, discounts: l.discounts.map((d) => ({ label: d.label, amount_cents: d.amount })) })),
    busy: r.payload.services.flatMap((s) => s.busy),
  };
}

export default async function DevCalendar({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : sp.view === "month" ? "month" : "day";
  const day = isDateStr(sp.date) ? sp.date : "2026-12-01";
  const from = view === "week" ? startOfWeek(day) : view === "month" ? startOfWeek(`${day.slice(0, 8)}01`) : day;
  const flagDate = "2026-10-20T20:30:00.000Z";

  const data: CalendarData = {
    can: { book: true, change: true, override: true, deposits: true, pricing: true, checkout: true, all: true },
    stylists: [
      { id: "s1", name: "Karissa Frazier", role: "owner", color: "#257de0", hours: null, serviceIds: null, bookable: true, title: null },
      { id: "s2", name: "Sam Lee", role: "stylist", color: "#f47230", hours: null, serviceIds: null, bookable: true, title: "Cuts" },
    ],
    staffNames: { s1: "Karissa Frazier", s2: "Sam Lee" },
    viewStaff: null,
    me: "s1",
    businessName: "Intensity Salon (sample data)",
    timezone: TZ,
    hours: menuJson.hours as unknown as CalendarData["hours"],
    policy, rules, stages: menu.stages, view, from, days: view === "month" ? 42 : view === "week" ? 7 : 1, today: "2026-12-01",
    appointments: [
      appt("a1", "c1", "Jamie R.", "2026-12-01", "15:30", ["all_over_color", "womens_cut", "style"]),
      { ...appt("a2", "c2", "Morgan T.", "2026-12-01", "16:05", ["mens_boys_cut"], 2000, 0), staffId: "s2" },
      appt("a3", "c3", "Taylor S.", "2026-12-03", "15:30", ["balayage", "olaplex"], 5000, 5000),
      appt("a4", "c4", "Riley P.", "2026-12-05", "07:15", ["updo"]),
    ],
    clientStates: {
      c1: { onTimeVisits: ["2026-11-01T20:00:00.000Z"], priorVisitCount: 8, flags: [{ id: "f1", type: "no_show", createdAt: flagDate, appointmentStart: flagDate, permanent: false, clearedAt: null, clearNote: null, feeCharged: 12500 }], depositOverride: null, outstandingBalance: 0 },
      c2: { onTimeVisits: [], priorVisitCount: 0, flags: [], depositOverride: null, outstandingBalance: 0 },
      c3: { onTimeVisits: [], priorVisitCount: 0, flags: [], depositOverride: null, outstandingBalance: 0 },
      c4: { onTimeVisits: [], priorVisitCount: 5, flags: [{ id: "f2", type: "late_cancel", createdAt: "2026-02-01T00:00:00.000Z", appointmentStart: "2026-02-01T00:00:00.000Z", permanent: false, clearedAt: "2026-06-01T00:00:00.000Z", clearNote: "ok", feeCharged: 0 }], depositOverride: null, outstandingBalance: 0 },
    },
    services: menu.categories.flatMap((c, ci) =>
      c.services.map((s, si) => ({
        id: s.key, key: s.key, name: s.name, price_type: s.priceType, price_cents: Math.round(s.price * 100), estimated_hours: null,
        active_min: s.active, processing_min: s.processing, finish_min: s.finish, deposit_category: s.depositCategory, stage: s.stage,
        includes: s.includes ?? [], is_add_on: !!s.isAddOn, category: c.name, categorySort: ci, sort: si, bookable_online: true,
      })),
    ),
    paymentMethods: MANUAL_METHODS,
    holidays: mergeHolidays(null),
    daysOff: [
      { id: "t1", start: "2026-12-04T15:00:00.000Z", end: "2026-12-04T17:00:00.000Z", reason: "Dentist", allDay: false },
      { id: "t2", start: "2026-12-24T06:00:00.000Z", end: "2026-12-27T06:00:00.000Z", reason: "Christmas break", allDay: true },
    ],
    clients: [
      { id: "c1", firstName: "Jamie", lastName: "R.", phone: "(555) 010-0101", email: null, favorites: { serviceIds: ["all_over_color", "womens_cut"], weekdays: [5], block: "morning" } },
      { id: "c2", firstName: "Morgan", lastName: "T.", phone: "(555) 010-0102", email: null, favorites: null },
      { id: "c3", firstName: "Taylor", lastName: "S.", phone: null, email: "taylor@example.com", favorites: null },
    ],
  };
  return <CalendarView data={data} focusDate={day} sampleOpenTimes />;
}
