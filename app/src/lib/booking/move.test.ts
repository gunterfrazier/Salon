import { describe, expect, it } from "vitest";
import { moveStarts } from "./move";

const TZ = "America/Chicago";
const ct = (t: string) => new Date(`2026-12-01T${t}:00-06:00`);
const hours = { tue: ["09:00", "17:00"] as [string, string] };
// Color 10:00–12:00: on 10:00–10:45, processing, finish 11:30–12:00.
const appt = { start: ct("10:00"), end: ct("12:00"), busy: [{ start: ct("10:00"), end: ct("10:45") }, { start: ct("11:30"), end: ct("12:00") }] };

describe("moveStarts", () => {
  it("offers times that fit, ignoring the appointment's own blocks", () => {
    const times = moveStarts({ date: "2026-12-01", tz: TZ, hours, appt, busy: [...appt.busy, { start: ct("14:00"), end: ct("14:45") }], now: ct("08:00"), stepMinutes: 30 });
    const hhmm = times.map((m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);
    // Up to 15:00 (ends 17:00). 12:30–14:30 put the hands-on or finish time on the 14:00 client.
    expect(hhmm).toEqual(["9:00", "9:30", "10:00", "10:30", "11:00", "11:30", "12:00", "15:00"]);
  });

  it("uses the processing gap and skips past times and closed days", () => {
    // Another client 11:00–11:30 fits inside processing when color starts at 10:15 (on 10:15–11:00, finish 11:45–12:15).
    const busy = [{ start: ct("11:00"), end: ct("11:30") }];
    const times = moveStarts({ date: "2026-12-01", tz: TZ, hours, appt, busy, now: ct("10:05"), stepMinutes: 15 });
    expect(times[0]).toBe(10 * 60 + 15);
    expect(times).not.toContain(10 * 60 + 30); // on 10:30–11:15 hits 11:00
    expect(moveStarts({ date: "2026-12-02", tz: TZ, hours, appt, busy: [], now: ct("08:00") })).toEqual([]);
  });
});
