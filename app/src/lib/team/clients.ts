/** Who keeps a team member's clients when they leave (each salon's choice, by role). */

export type KeepRule = "salon" | "copy";
/** Roles that see clients of their own. */
export const KEEP_ROLES = ["renter", "stylist", "manager"] as const;
export type KeepRole = (typeof KEEP_ROLES)[number];

export interface TeamSettings {
  clientsOnLeave: Record<KeepRole, KeepRule>;
}

/** Booth renters usually own their clients; employees' clients usually stay with the salon. */
export const DEFAULT_TEAM: TeamSettings = { clientsOnLeave: { renter: "copy", stylist: "salon", manager: "salon" } };

export function cleanTeamSettings(raw: unknown): TeamSettings {
  const r = ((raw ?? {}) as Partial<TeamSettings>).clientsOnLeave ?? {};
  const out = { ...DEFAULT_TEAM.clientsOnLeave };
  for (const k of KEEP_ROLES) {
    const v = (r as Record<string, unknown>)[k];
    if (v === "salon" || v === "copy") out[k] = v;
  }
  return { clientsOnLeave: out };
}

/** The rule for someone with this role (owners and front desk: the salon keeps them). */
export const keepRuleFor = (s: TeamSettings, role: string): KeepRule => ((KEEP_ROLES as readonly string[]).includes(role) ? s.clientsOnLeave[role as KeepRole] : "salon");
