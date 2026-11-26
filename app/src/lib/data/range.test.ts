import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseRange } from "./calendar";

describe("parseRange", () => {
  it("parses Postgres tstzrange text", () => {
    expect(parseRange('["2026-12-01 21:00:00+00","2026-12-01 21:30:00+00")')).toEqual({
      start: "2026-12-01T21:00:00.000Z",
      end: "2026-12-01T21:30:00.000Z",
    });
  });
  it("handles offsets and fractional seconds", () => {
    expect(parseRange('["2026-12-01 15:00:00.5-06","2026-12-01 15:30:00-06")').start).toBe("2026-12-01T21:00:00.500Z");
  });
});
