import { clientStanding, type ClientStanding } from "../policy/flags";
import type { ClientPolicyState, PolicySettings } from "../policy/types";
import type { StatusKey } from "./status-colors";

/** Which color-chart chips to show for a client. */
export function clientChips(client: ClientPolicyState, policy: PolicySettings, now: Date): { chips: { status: StatusKey; text?: string }[]; standing: ClientStanding } {
  const standing = clientStanding(client, policy, now);
  const chips: { status: StatusKey; text?: string }[] = [];

  if (standing.standing === "permanent") chips.push({ status: "permanent_flag" });
  else if (standing.standing === "active") {
    const active = standing.history.find((h) => h.state === "active")!;
    const left = active.visitsRemaining !== null ? ` · ${active.visitsRemaining} to clear` : "";
    chips.push({ status: active.flag.type === "no_show" ? "no_show" : "late_cancel", text: `${active.flag.type === "no_show" ? "No-show" : "Late cancel"}${left}` });
  } else if (standing.standing === "history") chips.push({ status: "past_violation" });

  if (client.outstandingBalance > 0) chips.push({ status: "balance_owed", text: `Owes $${(client.outstandingBalance / 100).toFixed(2)}` });
  if (client.onTimeVisits.length + client.priorVisitCount === 0) chips.push({ status: "new_client" });
  return { chips, standing };
}

export const NEW_CLIENT_STATE: ClientPolicyState = { onTimeVisits: [], priorVisitCount: 0, flags: [], depositOverride: null, outstandingBalance: 0 };
