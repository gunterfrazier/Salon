import { describe, expect, it } from "vitest";
import { cleanWalkinSettings, DEFAULT_WALKINS, earliestStart, periodStart, predictLine, turnWeight, waitLabel, type StylistState, type WalkinSettings } from "./engine";

const T0 = Date.UTC(2026, 11, 1, 15, 0); // 9:00 AM Central
const min = (m: number) => T0 + m * 60_000;
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const st = (id: string, over: Partial<StylistState> = {}): StylistState => ({ id, name: id.slice(-1), inRotation: true, serviceIds: null, busy: [], dayEnd: min(8 * 60), turns: 0, ...over });
const person = (id: string, over: Partial<{ requested: string | null; minutes: number; weight: number; serviceIds: string[] }> = {}) => ({ id, requested: null, serviceIds: [], minutes: 30, weight: 1, ...over });
const S = (over: Partial<WalkinSettings>) => ({ ...DEFAULT_WALKINS, mode: "both" as const, ...over });

describe("walk-in settings and turns", () => {
  it("reads settings safely", () => {
    expect(cleanWalkinSettings(null)).toEqual(DEFAULT_WALKINS);
    expect(cleanWalkinSettings({ mode: "only", method: "rotation", order: [A, "x", A], quickMinutes: 1 })).toMatchObject({ mode: "only", method: "rotation", order: [A], quickMinutes: 20 });
  });
  it("counts turns the salon's way", () => {
    expect(turnWeight({ turns: "visit", quickMinutes: 20 }, 15, 1500)).toBe(1);
    expect(turnWeight({ turns: "half_quick", quickMinutes: 20 }, 15, 1500)).toBe(0.5);
    expect(turnWeight({ turns: "half_quick", quickMinutes: 20 }, 45, 3500)).toBe(1);
    expect(turnWeight({ turns: "minutes", quickMinutes: 20 }, 45, 3500)).toBe(0.75);
    expect(turnWeight({ turns: "dollars", quickMinutes: 20 }, 45, 3500)).toBe(35);
  });
  it("starts turn counts over", () => {
    expect(periodStart("daily", "2026-12-03", 4)).toBe("2026-12-03");
    expect(periodStart("weekly", "2026-12-03", 4)).toBe("2026-11-29");
    expect(periodStart("never", "2026-12-03", 4)).toBeNull();
  });
});

describe("fitting a walk-in in", () => {
  it("uses gaps before the next appointment and the end of the day", () => {
    const busy = [{ start: min(20), end: min(60) }];
    expect(earliestStart(busy, min(480), T0, 15)).toBe(T0);
    expect(earliestStart(busy, min(480), T0, 30)).toBe(min(60));
    expect(earliestStart([], min(20), T0, 30)).toBeNull();
    expect(earliestStart([], null, T0, 30)).toBeNull();
  });
});

describe("who takes the next walk-in", () => {
  it("soonest: whoever is free first", () => {
    const p = predictLine([st(A, { busy: [{ start: T0, end: min(40) }] }), st(B)], [person("1")], S({ method: "soonest" }), T0);
    expect(p.people[0]).toEqual({ id: "1", staffId: B, start: T0 });
  });

  it("fixed: first on the list who's free, otherwise the next", () => {
    const s = S({ method: "fixed", order: [B, A] });
    expect(predictLine([st(A), st(B)], [person("1")], s, T0).people[0].staffId).toBe(B);
    const busyB = predictLine([st(A), st(B, { busy: [{ start: T0, end: min(45) }] })], [person("1")], s, T0);
    expect(busyB.people[0].staffId).toBe(A);
  });

  it("rotation: fewest turns, then the salon's order; half turns keep you up", () => {
    const s = S({ method: "rotation", order: [A, B, C] });
    const line = [person("1"), person("2"), person("3"), person("4")];
    const p = predictLine([st(A), st(B), st(C)], line, s, T0);
    expect(p.people.map((x) => x.staffId)).toEqual([A, B, C, A]);
    // A did a quick half turn earlier: still fewer than B's full turn, so A is next.
    const half = predictLine([st(A, { turns: 0.5 }), st(B, { turns: 1 })], [person("1")], s, T0);
    expect(half.people[0].staffId).toBe(A);
  });

  it("balanced: evens turns out, even if that stylist is free a little later", () => {
    const s = S({ method: "balanced" });
    const p = predictLine([st(A, { turns: 3 }), st(B, { turns: 1, busy: [{ start: T0, end: min(10) }] })], [person("1")], s, T0);
    expect(p.people[0]).toMatchObject({ staffId: B, start: min(10) });
  });

  it("a requested stylist always comes first, and only stylists in the rotation get the rest", () => {
    const s = S({ method: "soonest" });
    const p = predictLine([st(A, { inRotation: false }), st(B, { busy: [{ start: T0, end: min(30) }] })], [person("1", { requested: A }), person("2")], s, T0);
    expect(p.people[0]).toMatchObject({ staffId: A, start: T0 });
    expect(p.people[1]).toMatchObject({ staffId: B, start: min(30) });
  });

  it("skips stylists who don't do the service", () => {
    const p = predictLine([st(A, { serviceIds: ["cut"] }), st(B, { serviceIds: ["color"], busy: [{ start: T0, end: min(20) }] })], [person("1", { serviceIds: ["color"] })], S({}), T0);
    expect(p.people[0]).toMatchObject({ staffId: B, start: min(20) });
  });

  it("estimates waits for each stylist and for anyone", () => {
    const p = predictLine([st(A), st(B)], [person("1"), person("2"), person("3")], S({ method: "soonest" }), T0);
    expect(p.people.map((x) => x.start)).toEqual([T0, T0, min(30)]);
    expect(p.anyone.start).toBe(min(30));
    expect(p.stylists.map((x) => x.next)).toEqual([min(60), min(30)]);
    expect(waitLabel(T0, T0)).toBe("No wait");
    expect(waitLabel(min(12), T0)).toBe("about 10–20 min");
    expect(waitLabel(null, T0)).toBe("Not today");
  });
});
