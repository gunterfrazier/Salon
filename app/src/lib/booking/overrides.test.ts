import { describe, expect, it } from "vitest";
import menuJson from "../../../seed/service-menu.json";
import { servicesByKey as s } from "../menu";
import { formatMinutes, parseHHMM, zonedToUtc } from "../time/zone";
import type { Hours } from "./availability";
import { collisions, openTimes, outsideHours } from "./overrides";

const TZ = "America/Chicago";
const hours = menuJson.hours as unknown as Hours; // Tue 3:30–7, Thu 3:30–8:30, Fri 9–4, Sat 7:15–2
const now = new Date("2026-11-26T12:00:00Z");
const at = (date: string, t: string) => zonedToUtc(date, parseHHMM(t), TZ);
const times = (ms: number[]) => ms.map(formatMinutes);

describe("open times for the stylist", () => {
  it("lists times soonest first, filtered by the services' length", () => {
    const any = openTimes({ date: "2026-12-01", tz: TZ, hours, services: [], busy: [], now, stepMinutes: 15 });
    expect(times([any[0], any[any.length - 1]])).toEqual(["3:30 PM", "6:30 PM"]);
    const cut = openTimes({ date: "2026-12-01", tz: TZ, hours, services: [s.womens_cut], busy: [], now, stepMinutes: 15 });
    expect(times([cut[0], cut[cut.length - 1]])).toEqual(["3:30 PM", "6:15 PM"]);
  });

  it("skips hands-on time already booked", () => {
    const busy = [{ start: at("2026-12-01", "15:30"), end: at("2026-12-01", "16:30") }];
    const r = openTimes({ date: "2026-12-01", tz: TZ, hours, services: [s.womens_cut], busy, now, stepMinutes: 15 });
    expect(formatMinutes(r[0])).toBe("4:30 PM");
  });

  it("has nothing on a closed day or a day already over", () => {
    expect(openTimes({ date: "2026-12-02", tz: TZ, hours, services: [], busy: [], now, stepMinutes: 15 })).toEqual([]);
    expect(openTimes({ date: "2026-11-24", tz: TZ, hours, services: [], busy: [], now, stepMinutes: 15 })).toEqual([]);
  });
});

describe("override checks", () => {
  it("spots bookings outside working hours", () => {
    expect(outsideHours("2026-12-01", parseHHMM("15:30"), 45, hours)).toBeNull();
    expect(outsideHours("2026-12-01", parseHHMM("15:00"), 45, hours)).toBe("starts before opening");
    expect(outsideHours("2026-12-01", parseHHMM("18:30"), 45, hours)).toBe("runs past closing");
    expect(outsideHours("2026-12-02", parseHHMM("10:00"), 45, hours)).toBe("not a working day");
  });

  it("finds double-bookings", () => {
    const busy = [{ start: at("2026-12-01", "16:00"), end: at("2026-12-01", "17:00") }];
    expect(collisions([{ start: at("2026-12-01", "16:30"), end: at("2026-12-01", "17:15") }], busy)).toHaveLength(1);
    expect(collisions([{ start: at("2026-12-01", "17:00"), end: at("2026-12-01", "17:45") }], busy)).toHaveLength(0);
  });
});
