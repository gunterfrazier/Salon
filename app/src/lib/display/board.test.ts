import { describe, expect, it } from "vitest";
import { buildBoard, publicName, reviewSnippet, type BoardAppt } from "./board";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 11, 1, h, m)).toISOString();
const a = (id: string, staffId: string, h: number, len: number, status = "booked", name = "Jamie Rivers"): BoardAppt => ({ id, staffId, clientName: name, start: at(h), end: at(h, len), status, services: ["Cut"] });

describe("display board", () => {
  it("shows first name and last initial only", () => {
    expect(publicName("Jamie Lynn Rivers")).toBe("Jamie R.");
    expect(publicName("Morgan")).toBe("Morgan");
    expect(publicName("  ")).toBe("Guest");
  });

  it("marks done, now, checked-in and the next visit per stylist", () => {
    const now = new Date(at(15, 10));
    const cols = buildBoard(
      [a("1", "k", 14, 60, "completed"), a("2", "k", 15, 45, "in_service"), a("3", "k", 16, 60, "checked_in"), a("4", "k", 17, 60), a("5", "k", 18, 60), a("6", "k", 19, 60, "cancelled"), a("7", "s", 16, 30)],
      [{ id: "k", name: "Karissa Frazier" }, { id: "s", name: "Sam Lee" }, { id: "z", name: "Zoe" }],
      now,
    );
    expect(cols.map((c) => c.stylist)).toEqual(["Karissa", "Sam"]);
    expect(cols[0].rows.map((r) => r.state)).toEqual(["done", "now", "here", "next", "later"]);
    expect(cols[1].rows.map((r) => r.state)).toEqual(["next"]);
    expect(cols[0].rows[0].name).toBe("Jamie R.");
  });

  it("shortens long reviews at a word", () => {
    const long = "Karissa is amazing ".repeat(20);
    const s = reviewSnippet(long, 60);
    expect(s.length).toBeLessThanOrEqual(61);
    expect(s.endsWith("…")).toBe(true);
    expect(reviewSnippet("Loved it!")).toBe("Loved it!");
  });
});
