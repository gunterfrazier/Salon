import { describe, expect, it } from "vitest";
import { hoursFor, offersAll, toStylists, whoOffers, STYLIST_COLORS, type StaffRow } from "./stylists";

const row = (id: string, x: Partial<StaffRow> = {}): StaffRow => ({ id, display_name: `Name ${id}`, role: "stylist", color: null, hours: null, service_ids: null, bookable: true, title: null, sort: 0, active: true, ...x });

describe("stylists", () => {
  it("keeps active, bookable people in order with palette colors", () => {
    const list = toStylists([row("b", { sort: 2 }), row("a", { sort: 1 }), row("fd", { bookable: false }), row("off", { active: false }), row("c", { sort: 3, color: "#123456" })]);
    expect(list.map((s) => [s.id, s.color])).toEqual([["a", STYLIST_COLORS[0]], ["b", STYLIST_COLORS[1]], ["c", "#123456"]]);
    expect(toStylists([row("fd", { bookable: false })], { includeUnbookable: true })).toHaveLength(1);
  });

  it("uses their own hours or the salon's, and their services", () => {
    const salon = { tue: ["09:00", "17:00"] as [string, string] };
    const [own, std] = toStylists([row("a", { hours: { wed: ["10:00", "14:00"] }, service_ids: ["cut"] }), row("b", { sort: 1, service_ids: [] })]);
    expect(hoursFor(own, salon)).toEqual({ wed: ["10:00", "14:00"] });
    expect(hoursFor(std, salon)).toBe(salon);
    expect(offersAll(own, ["cut"])).toBe(true);
    expect(offersAll(own, ["cut", "color"])).toBe(false);
    expect(whoOffers([own, std], ["color"]).map((s) => s.id)).toEqual(["b"]);
  });
});
