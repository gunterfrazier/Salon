import { describe, expect, it } from "vitest";
import menuJson from "../../../seed/service-menu.json";
import type { Hours } from "../booking/availability";
import { parseHHMM, zonedToUtc } from "../time/zone";
import { dayLoad, nextAppointmentLine, openStatus, weekHours, windows, workingMinutes } from "./schedule";

const TZ = "America/Chicago";
const hours = menuJson.hours as unknown as Hours; // Tue 3:30–7, Thu 3:30–8:30, Fri 9–4, Sat 7:15–2
const at = (date: string, t: string) => zonedToUtc(date, parseHHMM(t), TZ);
const none = () => null;

describe("front window sign", () => {
  it("says open until closing, or when it opens next", () => {
    expect(openStatus(at("2026-12-01", "16:00"), TZ, hours, none)).toMatchObject({ open: true, line: "Open until 7 PM" });
    expect(openStatus(at("2026-12-01", "10:00"), TZ, hours, none)).toMatchObject({ open: false, line: "Opens today at 3:30 PM" });
    expect(openStatus(at("2026-12-01", "19:30"), TZ, hours, none).line).toBe("Closed · Opens Thursday at 3:30 PM");
    expect(openStatus(at("2026-12-03", "21:00"), TZ, hours, none).line).toBe("Closed · Opens tomorrow at 9 AM");
  });

  it("skips holidays", () => {
    const xmas = (d: string) => (d === "2026-12-24" || d === "2026-12-25" ? "Christmas" : null);
    // Thu Dec 24 and Fri Dec 25 closed → Saturday.
    expect(openStatus(at("2026-12-24", "16:00"), TZ, hours, xmas)).toMatchObject({ open: false, reason: "Christmas", line: "Closed · Opens Saturday at 7:15 AM" });
    const week = weekHours("2026-12-22", hours, xmas);
    expect(week.map((d) => `${d.label}: ${d.text}`)).toEqual([
      "Today: 3:30 – 7 PM",
      "Tomorrow: Closed",
      "Thursday: Closed · Christmas",
      "Friday: Closed · Christmas",
      "Saturday: 7:15 AM – 2 PM",
      "Sunday: Closed",
      "Monday: Closed",
    ]);
  });
});

describe("next appointment wording", () => {
  it("names the day when nothing is booked today", () => {
    const next = { start: at("2026-11-28", "07:15").toISOString(), clientName: "Gunter Frazier", services: ["Women's Cut"] };
    expect(nextAppointmentLine(next, "2026-11-27", TZ, { anyToday: false })).toBe(
      "No appointments today. The next appointment is tomorrow, Saturday, Nov 28 at 7:15 AM: Gunter F., Women's Cut.",
    );
    expect(nextAppointmentLine(next, "2026-11-25", TZ, { anyToday: true, fullName: true })).toBe(
      "No more appointments today. The next appointment is Saturday, Nov 28 at 7:15 AM: Gunter Frazier, Women's Cut.",
    );
    expect(nextAppointmentLine(null, "2026-11-27", TZ, { anyToday: false })).toBe("No appointments today. Nothing else is booked yet.");
  });
});

describe("open days", () => {
  it("grades how full a day is", () => {
    expect(workingMinutes("2026-12-01", hours)).toBe(210);
    expect(dayLoad(210, 60, false)).toBe("open");
    expect(dayLoad(210, 150, false)).toBe("busy");
    expect(dayLoad(210, 200, false)).toBe("full");
    expect(dayLoad(0, 0, false)).toBe("closed");
    expect(dayLoad(210, 0, true)).toBe("closed");
  });
});

describe("open windows", () => {
  it("joins 15-minute open starts into windows", () => {
    // Open 3:30–4:30 (starts 3:30..4:00 for a 30-minute slot), then 6:00–7:00.
    expect(windows([210, 225, 240, 360, 375, 390])).toEqual([{ start: 210, minutes: 60 }, { start: 360, minutes: 60 }]);
    expect(windows([])).toEqual([]);
  });
});
