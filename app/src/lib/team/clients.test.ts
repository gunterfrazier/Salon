import { describe, expect, it } from "vitest";
import { cleanTeamSettings, DEFAULT_TEAM, keepRuleFor } from "./clients";

describe("who keeps the clients", () => {
  it("defaults: renters get a copy, employees' clients stay", () => {
    expect(cleanTeamSettings(null)).toEqual(DEFAULT_TEAM);
    expect(keepRuleFor(DEFAULT_TEAM, "renter")).toBe("copy");
    expect(keepRuleFor(DEFAULT_TEAM, "stylist")).toBe("salon");
  });
  it("reads the salon's choice safely", () => {
    const s = cleanTeamSettings({ clientsOnLeave: { stylist: "copy", renter: "delete", owner: "copy" } });
    expect(s.clientsOnLeave).toEqual({ renter: "copy", stylist: "copy", manager: "salon" });
    expect(keepRuleFor(s, "owner")).toBe("salon");
    expect(keepRuleFor(s, "front_desk")).toBe("salon");
  });
});
