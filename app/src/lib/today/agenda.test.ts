import { describe, expect, it } from "vitest";
import type { CalAppointment } from "../data/calendar-types";
import policyJson from "../../../seed/policies.json";
import type { PolicySettings } from "../policy/types";
import { buildAgenda } from "./agenda";

const TZ = "America/Chicago";
const policy = policyJson as unknown as PolicySettings;
const hours = { tue: ["09:00", "17:00"] as [string, string] };
// 2026-12-01 is a Tuesday; Central is UTC-6.
const at = (hhmm: string) => `2026-12-01T${String(Number(hhmm.slice(0, 2)) + 6).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;

function appt(id: string, start: string, end: string, extra: Partial<CalAppointment> = {}): CalAppointment {
  return {
    id, staffId: "s1", clientId: `c-${id}`, clientName: id, clientPhone: null, start: at(start), end: at(end), status: "booked", notes: null,
    depositRequired: 0, depositPaid: 0,
    services: [{ id: `${id}-1`, serviceId: "s", name: "Cut", priceType: "fixed", listPrice: 5000, finalPrice: 5000, discounts: [] }],
    busy: [{ phase: "active", start: at(start), end: at(end) }],
    ...extra,
  };
}

const returning = { onTimeVisits: [], priorVisitCount: 3, flags: [], depositOverride: null, outstandingBalance: 0 };

describe("buildAgenda", () => {
  it("lists the day in order with totals, deposits and open gaps", () => {
    const color = appt("b", "13:00", "15:30", {
      depositRequired: 5000,
      depositPaid: 0,
      status: "pending",
      busy: [
        { phase: "active", start: at("13:00"), end: at("13:45") },
        { phase: "finish", start: at("14:30"), end: at("15:30") },
      ],
    });
    const data = {
      appointments: [color, appt("a", "09:30", "10:30"), appt("x", "11:00", "12:00", { status: "cancelled" })],
      clientStates: { "c-a": returning },
      policy, hours, timezone: TZ,
    };
    const g = buildAgenda(data, "2026-12-01", new Date(at("10:00")));
    expect(g.items.map((i) => i.appt.id)).toEqual(["a", "b"]);
    expect(g.items[0].when).toBe("now");
    expect(g.items[1].when).toBe("upcoming");
    expect(g.items[1].depositDue).toBe(5000);
    expect(g.items[1].isNew).toBe(true);
    expect(g.summary).toMatchObject({ count: 2, expected: 10000, depositsDue: 5000, newClients: 1, bookedMinutes: 210 });
    // 9:00–9:30, 10:30–13:00, processing 13:45–14:30, 15:30–17:00
    expect(g.gaps.map((x) => x.minutes)).toEqual([30, 150, 45, 90]);
  });

  it("marks closed days and no-shows", () => {
    const data = { appointments: [appt("a", "09:30", "10:30", { status: "no_show" })], clientStates: {}, policy, hours, timezone: TZ };
    const g = buildAgenda(data, "2026-12-01", new Date(at("12:00")));
    expect(g.items[0].when).toBe("done");
    expect(g.summary.count).toBe(0);
    expect(buildAgenda(data, "2026-12-01", new Date(), true).closed).toBe(true);
    expect(buildAgenda({ ...data, appointments: [] }, "2026-12-02", new Date()).closed).toBe(true); // Wednesday: no hours
  });
});
