import type { ClientFlag, ClientPolicyState } from "../policy/types";

/**
 * Everything the policy engine needs about each client: completed visits,
 * imported visit count, violation history, standing deposit rule, unpaid
 * balance. Returned as plain JSON (ISO dates) so it can go to the browser.
 */
export interface ClientStateJSON {
  onTimeVisits: string[];
  priorVisitCount: number;
  flags: (Omit<ClientFlag, "createdAt" | "appointmentStart" | "clearedAt"> & { createdAt: string; appointmentStart: string; clearedAt: string | null })[];
  depositOverride: ClientPolicyState["depositOverride"];
  outstandingBalance: number;
}

export function reviveClientState(j: ClientStateJSON): ClientPolicyState {
  return {
    onTimeVisits: j.onTimeVisits.map((d) => new Date(d)),
    priorVisitCount: j.priorVisitCount,
    flags: j.flags.map((f) => ({ ...f, createdAt: new Date(f.createdAt), appointmentStart: new Date(f.appointmentStart), clearedAt: f.clearedAt ? new Date(f.clearedAt) : null })),
    depositOverride: j.depositOverride,
    outstandingBalance: j.outstandingBalance,
  };
}
