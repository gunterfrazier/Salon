import { notFound } from "next/navigation";
import TodayView from "@/app/app/today/TodayView";
import type { CalAppointment } from "@/lib/data/calendar-types";
import type { PolicySettings } from "@/lib/policy/types";
import { buildAgenda } from "@/lib/today/agenda";
import policyJson from "../../../../seed/policies.json";

/** Development-only preview of the Today screen with sample data (404 in production). */
export const dynamic = "force-dynamic";

const TZ = "America/Chicago";
const at = (hhmm: string) => `2026-12-01T${String(Number(hhmm.slice(0, 2)) + 6).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const line = (name: string, cents: number) => ({ id: name, serviceId: name, name, priceType: "fixed", listPrice: cents, finalPrice: cents, discounts: [] });
function appt(id: string, name: string, s: string, e: string, services: ReturnType<typeof line>[], extra: Partial<CalAppointment> = {}): CalAppointment {
  return { id, staffId: "s1", clientId: id, clientName: name, clientPhone: "(256) 555-0101", start: at(s), end: at(e), status: "booked", notes: null, depositRequired: 0, depositPaid: 0, services, busy: [{ phase: "active", start: at(s), end: at(e) }], ...extra };
}

export default async function DevToday() {
  if (process.env.NODE_ENV === "production") notFound();
  const flagAt = "2026-10-20T20:30:00.000Z";
  const data = {
    timezone: TZ,
    policy: policyJson as unknown as PolicySettings,
    hours: { tue: ["09:00", "17:00"] as [string, string] },
    appointments: [
      appt("a", "Morgan Tate", "09:00", "10:00", [line("Women's Cut", 5500)], { status: "completed" }),
      appt("b", "Jamie Rivers", "10:30", "13:00", [line("All Over Color", 9025), line("Style", 3325)], {
        notes: "Wants to go a little lighter.",
        busy: [{ phase: "active", start: at("10:30"), end: at("11:15") }, { phase: "finish", start: at("12:00"), end: at("13:00") }],
      }),
      appt("c", "Taylor Shaw", "14:00", "16:30", [line("Full Highlights", 15000)], { status: "pending", depositRequired: 5000 }),
    ],
    clientStates: {
      a: { onTimeVisits: [], priorVisitCount: 5, flags: [], depositOverride: null, outstandingBalance: 0 },
      b: { onTimeVisits: [], priorVisitCount: 6, depositOverride: null, outstandingBalance: 0, flags: [{ id: "f1", type: "no_show" as const, createdAt: flagAt, appointmentStart: flagAt, permanent: false, clearedAt: null, clearNote: null, feeCharged: 12500 }] },
    },
  };
  const agenda = buildAgenda(data, "2026-12-01", new Date(at("11:00")));
  return <TodayView agenda={agenda} today="2026-12-01" timezone={TZ} closureLabel={null} basePath="/dev/today" />;
}
