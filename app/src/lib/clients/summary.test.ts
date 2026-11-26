import { describe, expect, it } from "vitest";
import { filterClients, type ClientSummary } from "./summary";

const now = new Date("2026-12-01T12:00:00Z");
const base: ClientSummary = { id: "", firstName: "", lastName: null, phone: null, email: null, lastVisit: null, nextVisit: null, visits: 3, balance: 0, standing: "clear", activeFlag: null };
const list: ClientSummary[] = [
  { ...base, id: "a", firstName: "Ana", lastName: "Lopez", phone: "(256) 555-0101", lastVisit: "2026-11-20T15:00:00Z" },
  { ...base, id: "b", firstName: "Beth", lastName: "Mays", email: "beth@example.com", lastVisit: "2026-08-01T15:00:00Z" },
  { ...base, id: "c", firstName: "cara", lastName: null, visits: 0 },
  { ...base, id: "d", firstName: "Dee", standing: "active", activeFlag: "no_show", balance: 3500, lastVisit: "2026-07-01T15:00:00Z", nextVisit: "2026-12-05T15:00:00Z" },
  { ...base, id: "e", firstName: "Eve", standing: "history" },
];
const ids = (r: ClientSummary[]) => r.map((c) => c.id);

describe("client list filters", () => {
  it("search by name, phone digits, or email; case-insensitive", () => {
    expect(ids(filterClients(list, "lop", "all", now))).toEqual(["a"]);
    expect(ids(filterClients(list, "555-0101", "all", now))).toEqual(["a"]);
    expect(ids(filterClients(list, "BETH@", "all", now))).toEqual(["b"]);
    expect(ids(filterClients(list, "", "all", now))).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("flagged = active or permanent only (not past history)", () => {
    expect(ids(filterClients(list, "", "flagged", now))).toEqual(["d"]);
  });
  it("owes money", () => {
    expect(ids(filterClients(list, "", "owes", now))).toEqual(["d"]);
  });
  it("not seen 8+ weeks, and nothing booked", () => {
    expect(ids(filterClients(list, "", "lapsed", now))).toEqual(["b"]);
  });
  it("new = no visits", () => {
    expect(ids(filterClients(list, "", "new", now))).toEqual(["c"]);
  });
});
