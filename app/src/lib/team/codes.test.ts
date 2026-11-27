import { describe, expect, it } from "vitest";
import { cleanJoinRole, codeProblem, joinLink, newJoinCode, normalizeJoinCode } from "./codes";

describe("join codes", () => {
  it("makes readable 8-character codes", () => {
    const c = newJoinCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(newJoinCode(() => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 31]))).toBe("ABCDEFG9");
  });

  it("reads what people type", () => {
    expect(normalizeJoinCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizeJoinCode("short")).toBeNull();
  });

  it("knows when a code can't be used", () => {
    const now = new Date("2026-12-01T12:00:00Z");
    const ok = { revoked_at: null, expires_at: null, max_uses: null, uses: 40 };
    expect(codeProblem(ok, now)).toBeNull();
    expect(codeProblem(null, now)).toMatch(/isn't right/);
    expect(codeProblem({ ...ok, revoked_at: "2026-11-30T00:00:00Z" }, now)).toMatch(/turned off/);
    expect(codeProblem({ ...ok, expires_at: "2026-12-01T11:59:59Z" }, now)).toMatch(/expired/);
    expect(codeProblem({ ...ok, expires_at: "2026-12-02T00:00:00Z" }, now)).toBeNull();
    expect(codeProblem({ ...ok, max_uses: 1, uses: 1 }, now)).toMatch(/used up/);
  });

  it("never hands out the owner role", () => {
    expect(cleanJoinRole("owner")).toBe("stylist");
    expect(cleanJoinRole("renter")).toBe("renter");
    expect(joinLink("https://chairvana.app/", "ABCD2345")).toBe("https://chairvana.app/signup?code=ABCD2345");
  });
});
