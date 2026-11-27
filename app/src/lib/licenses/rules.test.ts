import { describe, expect, it } from "vitest";
import { bookingExpiry, cleanLicense, daysLeft, licenseStatus, lookupLink, reminderDue, reminderText } from "./rules";

const base = { kind: "cosmetology", state: "al", number: " C 12345 ", holderName: " Karissa Frazier ", expiresOn: "2027-08-31" };

describe("licenses", () => {
  it("checks what was entered", () => {
    expect(cleanLicense(base, { establishment: false })).toEqual({ ok: true, value: { kind: "cosmetology", state: "AL", number: "C 12345", holder_name: "Karissa Frazier", expires_on: "2027-08-31" } });
    expect(cleanLicense({ ...base, kind: "establishment" }, { establishment: false })).toMatchObject({ ok: false });
    expect(cleanLicense({ ...base, kind: "establishment" }, { establishment: true })).toMatchObject({ ok: true });
    expect(cleanLicense({ ...base, state: "ZZ" }, { establishment: false })).toMatchObject({ ok: false });
    expect(cleanLicense({ ...base, number: "" }, { establishment: false })).toMatchObject({ ok: false });
    expect(cleanLicense({ ...base, expiresOn: "08/31/2027" }, { establishment: false })).toMatchObject({ ok: false });
    expect(cleanLicense({ ...base, expiresOn: "" }, { establishment: false })).toMatchObject({ ok: true, value: { expires_on: null } });
  });

  it("counts days and statuses", () => {
    expect(daysLeft("2026-12-27", "2026-11-27")).toBe(30);
    expect(daysLeft("2026-11-26", "2026-11-27")).toBe(-1);
    expect(licenseStatus("2026-11-26", "2026-11-27")).toBe("expired");
    expect(licenseStatus("2026-11-27", "2026-11-27")).toBe("soon");
    expect(licenseStatus("2027-11-27", "2026-11-27")).toBe("valid");
    expect(licenseStatus(null, "2026-11-27")).toBe("no-date");
  });

  it("reminds on the right days only", () => {
    expect(reminderDue("2027-02-25", "2026-11-27")).toBe(90);
    expect(reminderDue("2026-12-27", "2026-11-27")).toBe(30);
    expect(reminderDue("2026-11-27", "2026-11-27")).toBe(0);
    expect(reminderDue("2026-12-28", "2026-11-27")).toBeNull();
    expect(reminderText("cosmetology", "AL", "2026-12-27", 30, "you")).toMatch(/^Your AL cosmetology license expires in 30 days, on December 27, 2026/);
    expect(reminderText("barber", "TX", "2026-11-27", 0, "Sam")).toMatch(/^Sam's TX barber license expires today/);
  });

  it("uses the latest practicing license for booking", () => {
    expect(bookingExpiry([{ kind: "cosmetology", expires_on: "2026-01-01" }, { kind: "cosmetology", expires_on: "2027-01-01" }, { kind: "instructor", expires_on: "2030-01-01" }])).toBe("2027-01-01");
    expect(bookingExpiry([{ kind: "instructor", expires_on: "2020-01-01" }])).toBeNull();
    expect(lookupLink("AL", "barber")).toContain("AL%20barber%20board%20license%20lookup");
  });
});
