import { describe, expect, it } from "vitest";
import { backControl, cleanControl, cleanSchedule, jumpControl, NO_CONTROL, nextControl, pauseControl, playControl, playlistSource, playPosition, ruleNow } from "./playback";

const secs = [10, 20, 30]; // 60-second loop
const T0 = Date.UTC(2026, 0, 1); // the loop starts here

describe("in-step playback", () => {
  it("works out the slide from the clock, so every TV agrees", () => {
    expect(playPosition(secs, T0, NO_CONTROL)).toMatchObject({ index: 0, remaining: 10 });
    expect(playPosition(secs, T0 + 15_000, NO_CONTROL)).toMatchObject({ index: 1, elapsed: 5 });
    expect(playPosition(secs, T0 + 65_000, NO_CONTROL)).toMatchObject({ index: 0, elapsed: 5 });
    expect(playPosition([], T0, NO_CONTROL).index).toBe(0);
  });

  it("next, back and jump move every screen together", () => {
    const now = T0 + 15_000; // slide 1, 5 s in
    expect(playPosition(secs, now, nextControl(secs, now, NO_CONTROL)).index).toBe(2);
    expect(playPosition(secs, now, backControl(secs, now, NO_CONTROL))).toMatchObject({ index: 1 });
    expect(playPosition(secs, T0 + 10_500, backControl(secs, T0 + 10_500, NO_CONTROL)).index).toBe(0);
    expect(playPosition(secs, now, jumpControl(secs, now, NO_CONTROL, 0)).index).toBe(0);
  });

  it("pause holds the slide; play carries on from there", () => {
    const paused = pauseControl(T0 + 15_000, NO_CONTROL);
    expect(playPosition(secs, T0 + 500_000, paused)).toMatchObject({ index: 1, elapsed: 5 });
    const resumed = playControl(T0 + 500_000, paused);
    expect(playPosition(secs, T0 + 500_000, resumed)).toMatchObject({ index: 1 });
    expect(playPosition(secs, T0 + 500_000, resumed).elapsed).toBeCloseTo(5, 3);
  });

  it("reads stored control safely", () => {
    expect(cleanControl(null)).toEqual(NO_CONTROL);
    expect(cleanControl({ shift: 3, pausedAt: "x", override: { screenId: "nope", until: 5 } })).toEqual({ shift: 3, pausedAt: null, override: null });
  });
});

describe("screen schedules", () => {
  const A = "00000000-0000-0000-0000-00000000000a";
  const B = "00000000-0000-0000-0000-00000000000b";
  const rules = cleanSchedule([
    { id: "sat0", days: [6], from: "08:00", to: "12:00", screenId: A },
    { id: "night", days: [1, 2, 3, 4, 5], from: "19:00", to: "09:00", screenId: B },
    { days: [1], from: "bad", to: "09:00", screenId: A },
  ]);

  it("keeps only valid rules", () => {
    expect(rules.map((r) => r.id)).toEqual(["sat0", "night"]);
  });

  it("finds the rule running now, including overnight", () => {
    expect(ruleNow(rules, 6, 9 * 60)?.id).toBe("sat0");
    expect(ruleNow(rules, 2, 20 * 60)?.id).toBe("night");
    expect(ruleNow(rules, 3, 8 * 60)?.id).toBe("night"); // Tuesday night into Wednesday morning
    expect(ruleNow(rules, 1, 8 * 60)).toBeNull(); // Sunday night isn't a rule day
    expect(ruleNow(rules, 3, 12 * 60)).toBeNull();
  });

  it("picks what plays: remote, schedule, closed, own", () => {
    const own = "00000000-0000-0000-0000-000000000001";
    const at = { nowMs: 1000, day: 3, minute: 12 * 60, closed: false };
    expect(playlistSource(own, NO_CONTROL, rules, B, at)).toEqual({ screenId: own, why: "own" });
    expect(playlistSource(own, NO_CONTROL, rules, B, { ...at, closed: true })).toEqual({ screenId: B, why: "closed" });
    expect(playlistSource(own, NO_CONTROL, rules, null, { ...at, day: 6, minute: 600 })).toEqual({ screenId: A, why: "schedule" });
    const c = { ...NO_CONTROL, override: { screenId: A, until: 5000 } };
    expect(playlistSource(own, c, rules, B, at)).toMatchObject({ screenId: A, why: "override" });
    expect(playlistSource(own, c, rules, B, { ...at, nowMs: 6000 }).why).toBe("own");
  });
});
