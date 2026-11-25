import { describe, expect, it } from "vitest";
import { isOwnerEmail, ownerEmails } from "./owners";

describe("owner allowlist", () => {
  it("parses commas, spaces and case", () => {
    expect(ownerEmails(" A@Example.com, b@example.com ;c@example.org")).toEqual(["a@example.com", "b@example.com", "c@example.org"]);
  });
  it("ignores junk entries", () => {
    expect(ownerEmails("not-an-email, ,x@y.co")).toEqual(["x@y.co"]);
  });
  it("matches case-insensitively and only listed addresses", () => {
    expect(isOwnerEmail("  Owner@Salon.com ", "owner@salon.com")).toBe(true);
    expect(isOwnerEmail("someone@else.com", "owner@salon.com")).toBe(false);
    expect(isOwnerEmail("owner@salon.com", "")).toBe(false);
  });
});
