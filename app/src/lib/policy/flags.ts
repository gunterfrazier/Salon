import type { ClientFlag, ClientPolicyState, PolicySettings } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * - active:    deposit required; still counting on-time visits toward clearing
 * - permanent: stylist marked it permanent; never clears, deposit always required
 * - resolved:  cleared by on-time visits, time limit, or by hand; stays in history
 */
export type FlagState = "active" | "permanent" | "resolved";

export interface FlagStatus {
  flag: ClientFlag;
  state: FlagState;
  /** On-time visits completed since this flag. */
  onTimeVisitsSince: number;
  /** Visits still needed to clear (null if permanent / not visit-based / resolved). */
  visitsRemaining: number | null;
  resolvedBy: "visits" | "time" | "stylist" | null;
}

export function flagStatus(
  flag: ClientFlag,
  client: ClientPolicyState,
  policy: PolicySettings,
  now: Date,
): FlagStatus {
  const since = client.onTimeVisits.filter(
    (v) => v.getTime() > flag.appointmentStart.getTime() && v.getTime() <= now.getTime(),
  ).length;
  const base = { flag, onTimeVisitsSince: since };

  if (flag.clearedAt) return { ...base, state: "resolved", visitsRemaining: null, resolvedBy: "stylist" };
  if (flag.permanent) return { ...base, state: "permanent", visitsRemaining: null, resolvedBy: null };

  const need = policy.flags.clearAfterOnTimeVisits;
  if (need !== null && since >= need) return { ...base, state: "resolved", visitsRemaining: 0, resolvedBy: "visits" };

  const days = policy.flags.activeForDays;
  if (days !== null && now.getTime() - flag.createdAt.getTime() >= days * DAY_MS) {
    return { ...base, state: "resolved", visitsRemaining: null, resolvedBy: "time" };
  }

  return { ...base, state: "active", visitsRemaining: need === null ? null : need - since, resolvedBy: null };
}

/**
 * Overall client standing, worst first. Drives deposit rules, booking alerts,
 * calendar badges and the color chart.
 * - permanent: at least one permanent flag
 * - active:    at least one active flag
 * - history:   only resolved flags (past violations, warning only)
 * - clear:     no violations ever
 */
export type Standing = "permanent" | "active" | "history" | "clear";

export interface ClientStanding {
  standing: Standing;
  /** Every violation, newest first, with its status. */
  history: FlagStatus[];
  depositRequired: boolean;
  counts: { noShows: number; lateCancels: number };
}

export function clientStanding(client: ClientPolicyState, policy: PolicySettings, now: Date): ClientStanding {
  const history = client.flags
    .map((f) => flagStatus(f, client, policy, now))
    .sort((a, b) => b.flag.appointmentStart.getTime() - a.flag.appointmentStart.getTime());

  const has = (s: FlagState) => history.some((h) => h.state === s);
  const standing: Standing = has("permanent") ? "permanent" : has("active") ? "active" : history.length ? "history" : "clear";

  return {
    standing,
    history,
    depositRequired: standing === "permanent" || standing === "active",
    counts: {
      noShows: client.flags.filter((f) => f.type === "no_show").length,
      lateCancels: client.flags.filter((f) => f.type === "late_cancel").length,
    },
  };
}

export interface BookingAlert {
  standing: Exclude<Standing, "clear">;
  title: string;
  message: string;
  /** For the "View history" link. */
  history: FlagStatus[];
}

const label = { no_show: "No-show", late_cancel: "Late cancellation" } as const;

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Alert shown to the stylist when a client with any violation history books. */
export function bookingAlert(
  clientName: string,
  client: ClientPolicyState,
  policy: PolicySettings,
  now: Date,
): BookingAlert | null {
  const s = clientStanding(client, policy, now);
  if (s.standing === "clear" || !policy.bookingAlerts.notifyOnBookingBy.includes(s.standing)) return null;

  const latest = s.history[0];
  const what = `${label[latest.flag.type]} on ${fmtDate(latest.flag.appointmentStart)}`;
  const tally = [
    s.counts.noShows && `${s.counts.noShows} no-show${s.counts.noShows > 1 ? "s" : ""}`,
    s.counts.lateCancels && `${s.counts.lateCancels} late cancellation${s.counts.lateCancels > 1 ? "s" : ""}`,
  ].filter(Boolean).join(", ");

  if (s.standing === "permanent") {
    return { standing: "permanent", title: `${clientName} has a permanent flag`, message: `Full payment required. History: ${tally}. Most recent: ${what}.`, history: s.history };
  }
  if (s.standing === "active") {
    const active = s.history.find((h) => h.state === "active")!;
    const left = active.visitsRemaining !== null ? ` Clears after ${active.visitsRemaining} more on-time visit${active.visitsRemaining === 1 ? "" : "s"}.` : "";
    return { standing: "active", title: `${clientName} is flagged`, message: `Full payment required. ${what}.${left}`, history: s.history };
  }
  return { standing: "history", title: `${clientName} was flagged in the past`, message: `History: ${tally}. Most recent: ${what}. No deposit required.`, history: s.history };
}
