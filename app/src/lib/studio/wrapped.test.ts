import { describe, expect, it } from "vitest";
import { buildWrapped } from "./wrapped";

describe("Chair Wrapped", () => {
  it("adds up the year", () => {
    const v = (c: string, start: string, minutes: number, services: string[]) => ({ clientId: c, start, minutes, services });
    const w = buildWrapped(
      2026,
      [v("a", "2026-03-02", 120, ["Color", "Cut"]), v("a", "2026-03-20", 60, ["Cut"]), v("a", "2026-07-01", 60, ["Cut"]), v("b", "2026-03-09", 45, ["Blowout"]), v("c", "2026-11-10", 90, ["Color"])],
      new Set(["b"]),
      7,
    );
    expect(w).toEqual({ year: 2026, visits: 5, clients: 3, newClients: 2, hours: 6, topService: "Cut", busiestMonth: "March", fiveStar: 7, regulars: 1 });
  });
  it("handles an empty year", () => {
    expect(buildWrapped(2026, [], new Set(), 0)).toMatchObject({ visits: 0, topService: null, busiestMonth: null });
  });
});
