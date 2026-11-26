import { describe, expect, it } from "vitest";
import { formatPhone, guessMapping, parseCsv, phoneKey, prepareImport } from "./import";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and newlines in fields, CRLF, BOM", () => {
    const csv = '﻿First Name,Last Name,Notes\r\nAna,"Lopez, Jr.","Likes ""cool"" tones\nNo bleach"\r\n,,\r\nBeth,Mays,\n';
    expect(parseCsv(csv)).toEqual([
      ["First Name", "Last Name", "Notes"],
      ["Ana", "Lopez, Jr.", 'Likes "cool" tones\nNo bleach'],
      ["Beth", "Mays", ""],
    ]);
  });
});

describe("guessMapping", () => {
  it("StyleSeat-style headers", () => {
    expect(guessMapping(["First Name", "Last Name", "Email", "Phone Number", "Client Notes", "Total Appointments"])).toEqual({
      firstName: 0, lastName: 1, email: 2, phone: 3, notes: 4, visits: 5,
    });
  });
  it("single name column", () => {
    expect(guessMapping(["Client Name", "Mobile", "E-mail"])).toEqual({ fullName: 0, phone: 1, email: 2 });
  });
});

describe("phones", () => {
  it("formats and keys US numbers", () => {
    expect(formatPhone("+1 256.555.0101")).toBe("(256) 555-0101");
    expect(phoneKey("(256) 555-0101")).toBe(phoneKey("12565550101"));
  });
});

describe("prepareImport", () => {
  const rows = parseCsv(
    [
      "First Name,Last Name,Email,Phone,Visits",
      "Ana,Lopez,ANA@EXAMPLE.COM,256-555-0101,12",
      "Beth,,beth@example.com,,",
      ",,nobody@example.com,,",
      "Cara,Diaz,,2565550101,", // same phone as Ana → duplicate within file
      "Dee,Ray,dee@example.com,,", // matches existing client
      "Eve,Ng,not-an-email,,",
    ].join("\n"),
  );
  const map = guessMapping(rows[0]);
  const result = prepareImport(rows, map, [{ phone: null, email: "dee@example.com" }], { hasHeader: true, markReturning: true });

  it("normalizes and keeps visit counts", () => {
    expect(result[0]).toMatchObject({ line: 2, firstName: "Ana", lastName: "Lopez", email: "ana@example.com", phone: "(256) 555-0101", priorVisits: 12, status: "new" });
  });
  it("no visit count + markReturning → 1 prior visit (not a new client)", () => {
    expect(result[1]).toMatchObject({ firstName: "Beth", priorVisits: 1, status: "new" });
  });
  it("flags invalid and duplicate rows", () => {
    expect(result.map((r) => r.status)).toEqual(["new", "new", "invalid", "duplicate", "duplicate", "invalid"]);
  });
  it("full-name column is split", () => {
    const r = parseCsv("Client Name,Phone\nMaria de la Cruz,555-123-4567");
    expect(prepareImport(r, guessMapping(r[0]), [], { hasHeader: true, markReturning: false })[0]).toMatchObject({ firstName: "Maria", lastName: "de la Cruz", priorVisits: 0 });
  });
});
