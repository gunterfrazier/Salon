import { describe, expect, it } from "vitest";
import { cleanOverrides, navFor, permissionsFor, PERMISSIONS } from "./permissions";

describe("permissions", () => {
  it("gives the owner everything, always", () => {
    expect(permissionsFor("owner", { owner: { "reports.view": false } } as never).size).toBe(PERMISSIONS.length);
  });

  it("uses role defaults with the salon's overrides", () => {
    const stylist = permissionsFor("stylist", {});
    expect(stylist.has("checkout")).toBe(true);
    expect(stylist.has("calendar.all")).toBe(false);
    expect(stylist.has("reports.view")).toBe(false);
    const custom = permissionsFor("stylist", { stylist: { "reports.view": true, checkout: false } });
    expect(custom.has("reports.view")).toBe(true);
    expect(custom.has("checkout")).toBe(false);
    expect(permissionsFor("manager", {}).has("team.manage")).toBe(false);
    expect(permissionsFor("stylist", { stylist: { "inventory.manage": true } }).has("inventory.view")).toBe(true);
    expect(permissionsFor("nobody", {}).size).toBe(0);
  });

  it("cleans stored overrides", () => {
    expect(cleanOverrides({ owner: { "reports.view": false }, stylist: { "reports.view": true, bogus: true, checkout: "yes" }, wizard: {} })).toEqual({ stylist: { "reports.view": true } });
  });

  it("shows only allowed menu items", () => {
    const labels = navFor(permissionsFor("stylist", {})).map((n) => n.label);
    expect(labels).toEqual(["Today", "Calendar", "Clients", "Inventory", "Sell", "Color chart"]);
    expect(navFor(permissionsFor("owner", {})).map((n) => n.label)).toContain("Team");
  });
});
