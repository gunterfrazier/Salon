import { describe, expect, it } from "vitest";
import { afterQuiet, beforeQuiet, dayPreviewDue, dueReminders, holdActions, plannedReminders, renderTemplate, smsSegments, type NotifyAppt } from "./engine";
import { DEFAULT_NOTIFICATIONS, mergeNotificationSettings, validateNotificationSettings } from "./settings";

const TZ = "America/Chicago";
const s = DEFAULT_NOTIFICATIONS; // reminders 48h (sms+email) and 3h (sms); quiet 20:00–08:00
const ct = (iso: string) => new Date(`${iso}-06:00`); // Central Standard Time

const appt = (start: string, extra: Partial<NotifyAppt> = {}): NotifyAppt => ({
  id: "a1", clientId: "c1", start: ct(start), status: "booked", createdAt: ct("2026-11-20T12:00"), depositDue: 0, ...extra,
});

describe("quiet hours", () => {
  it("moves scheduled messages earlier and event messages later", () => {
    expect(beforeQuiet(ct("2026-12-01T06:30"), TZ, s.quietHours)).toEqual(ct("2026-11-30T19:55"));
    expect(beforeQuiet(ct("2026-12-01T21:00"), TZ, s.quietHours)).toEqual(ct("2026-12-01T19:55"));
    expect(beforeQuiet(ct("2026-12-01T12:00"), TZ, s.quietHours)).toEqual(ct("2026-12-01T12:00"));
    expect(afterQuiet(ct("2026-12-01T23:10"), TZ, s.quietHours)).toEqual(ct("2026-12-02T08:00"));
    expect(afterQuiet(ct("2026-12-02T06:00"), TZ, s.quietHours)).toEqual(ct("2026-12-02T08:00"));
  });
});

describe("reminders", () => {
  it("plans each reminder, shifted out of quiet hours", () => {
    const p = plannedReminders(appt("2026-12-03T10:00"), s, TZ);
    expect(p.map((x) => x.sendAt)).toEqual([ct("2026-12-01T10:00"), ct("2026-12-02T19:55")]);
    expect(p[0].key).toBe(`reminder:a1:r1:${ct("2026-12-03T10:00").toISOString()}`);
  });

  it("skips reminders whose time passed before the booking was made", () => {
    const p = plannedReminders(appt("2026-12-03T15:00", { createdAt: ct("2026-12-02T09:00") }), s, TZ);
    expect(p.map((x) => x.template + x.sendAt.toISOString())).toEqual([`reminder${ct("2026-12-03T12:00").toISOString()}`]);
  });

  it("sends what's due once, latest only after an outage, never after the start", () => {
    const a = appt("2026-12-03T15:00");
    const now = ct("2026-12-03T12:30");
    const due = dueReminders([a], new Set(), s, TZ, now);
    expect(due.map((d) => d.key.split(":")[2])).toEqual(["r2"]);
    expect(dueReminders([a], new Set(due.map((d) => d.key)), s, TZ, now)).toEqual([]);
    expect(dueReminders([a], new Set(), s, TZ, ct("2026-12-03T15:01"))).toEqual([]);
    expect(dueReminders([{ ...a, status: "cancelled" }], new Set(), s, TZ, now)).toEqual([]);
  });

  it("gives a moved appointment fresh reminders", () => {
    const before = plannedReminders(appt("2026-12-03T15:00"), s, TZ).map((p) => p.key);
    const after = plannedReminders(appt("2026-12-04T15:00"), s, TZ).map((p) => p.key);
    expect(after.some((k) => before.includes(k))).toBe(false);
  });
});

describe("deposit holds", () => {
  const pending = appt("2026-12-05T10:00", { status: "pending", depositDue: 5000, createdAt: ct("2026-12-01T09:00") });
  it("reminds after 12 hours and releases after 24", () => {
    expect(holdActions([pending], new Set(), s, ct("2026-12-01T20:00"))).toEqual([]);
    expect(holdActions([pending], new Set(), s, ct("2026-12-01T21:00")).map((x) => x.kind)).toEqual(["remind"]);
    expect(holdActions([pending], new Set(["hold-remind:a1"]), s, ct("2026-12-01T22:00"))).toEqual([]);
    expect(holdActions([pending], new Set(["hold-remind:a1"]), s, ct("2026-12-02T09:00")).map((x) => x.kind)).toEqual(["release"]);
  });
  it("releases at least an hour before the start", () => {
    const soon = { ...pending, start: ct("2026-12-01T20:00") };
    expect(holdActions([soon], new Set(), s, ct("2026-12-01T19:00")).map((x) => x.kind)).toEqual(["release"]);
  });
});

describe("day preview", () => {
  it("goes out once after the chosen time, for tomorrow", () => {
    expect(dayPreviewDue(s, TZ, ct("2026-12-01T19:00"), null)).toBeNull();
    expect(dayPreviewDue(s, TZ, ct("2026-12-01T19:31"), null)).toBe("2026-12-02");
    expect(dayPreviewDue(s, TZ, ct("2026-12-01T21:00"), "2026-12-02")).toBeNull();
  });
});

describe("templates and settings", () => {
  it("fills placeholders and tidies missing ones", () => {
    expect(renderTemplate(s.templates.reminder, { first_name: "Jamie", services: "Toner", salon: "Intensity Salon", date: "Tue, Dec 1", time: "10:30 AM CST" })).toBe(
      "Hi Jamie! Reminder: Toner at Intensity Salon on Tue, Dec 1 at 10:30 AM CST. Need to change it?",
    );
  });
  it("counts SMS segments", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("Hi 💇")).toBe(1);
    expect(smsSegments("💇".repeat(40))).toBe(2);
  });
  it("merges saved settings over defaults and validates", () => {
    const m = mergeNotificationSettings({ client: { reminders: [{ id: "x", before: { days: 1 }, channels: ["sms"], enabled: true }] }, quietHours: null });
    expect(m.client.reminders).toHaveLength(1);
    expect(m.client.confirmation.enabled).toBe(true);
    expect(m.quietHours).toBeNull();
    expect(validateNotificationSettings(m)).toBeNull();
    expect(validateNotificationSettings({ ...m, depositHold: { releaseAfterHours: 4, remindAfterHours: 6 } })).toMatch(/before/);
    expect(validateNotificationSettings(DEFAULT_NOTIFICATIONS)).toBeNull();
  });
});
