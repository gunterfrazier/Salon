import { describe, expect, it } from "vitest";
import { cleanOverrides, cleanPersonal, navFor, permissionsFor, PERMISSIONS } from "./permissions";

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

  it("lets newer permissions follow the one they were split from", () => {
    const stylist = permissionsFor("stylist", {});
    expect(stylist.has("booking.change")).toBe(true);
    expect(stylist.has("booking.override")).toBe(true);
    expect(stylist.has("inventory.count")).toBe(false);
    // A salon that let stylists manage inventory keeps counting and ordering too.
    const inv = permissionsFor("stylist", { stylist: { "inventory.manage": true } });
    expect(inv.has("inventory.count") && inv.has("inventory.order")).toBe(true);
    // ...unless one is switched off on its own.
    expect(permissionsFor("stylist", { stylist: { "inventory.manage": true, "inventory.order": false } }).has("inventory.order")).toBe(false);
    expect(permissionsFor("stylist", { stylist: { "booking.override": false } }).has("booking.override")).toBe(false);
    expect(permissionsFor("front_desk", {}).has("deposits.override")).toBe(false);
  });

  it("applies one person's changes on top of their role", () => {
    const amy = permissionsFor("stylist", { stylist: { "reports.view": true } }, { "pricing.adjust": false, "inventory.count": true });
    expect(amy.has("reports.view")).toBe(true);
    expect(amy.has("pricing.adjust")).toBe(false);
    expect(amy.has("inventory.count")).toBe(true);
    expect(amy.has("inventory.view")).toBe(true);
    expect(permissionsFor("owner", {}, { "reports.view": false }).has("reports.view")).toBe(true);
    expect(cleanPersonal({ "pricing.adjust": false, nope: true, checkout: 1 })).toEqual({ "pricing.adjust": false });
  });

  it("cleans stored overrides", () => {
    expect(cleanOverrides({ owner: { "reports.view": false }, stylist: { "reports.view": true, bogus: true, checkout: "yes" }, wizard: {} })).toEqual({ stylist: { "reports.view": true } });
  });

  it("shows only allowed menu items", () => {
    const labels = navFor(permissionsFor("stylist", {})).map((n) => n.label);
    expect(labels).toEqual(["Today", "Calendar", "Waitlist", "Clients", "Front desk", "Inventory", "Sell", "Pay", "Licenses", "Out sick", "Color chart"]);
    expect(navFor(permissionsFor("owner", {})).map((n) => n.label)).toContain("Team");
  });
});
