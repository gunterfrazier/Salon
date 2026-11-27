/** The parts of the booking & cancellation policy a salon edits in Settings → Policies. */
import type { PolicySettings } from "./types";

export interface PolicyForm {
  lateCancelWindowHours: number;
  /** New clients: per service kind. Dollars. */
  colorDeposit: { on: boolean; amount: number; minimum: number };
  standardDeposit: { on: boolean; amount: number; minimum: number };
  /** Clients with an active flag pay the full price up front. */
  flaggedPayFull: boolean;
  /** On-time visits that clear a flag; null = only by hand. */
  clearAfterVisits: number | null;
  lateCancelFee: "full" | "none";
  noShowFee: "full" | "none";
  staffCanChangeDeposit: boolean;
}

export function toForm(p: PolicySettings): PolicyForm {
  const nc = p.deposits.newClient;
  return {
    lateCancelWindowHours: p.lateCancelWindowHours,
    colorDeposit: { on: !!nc.enabledFor.color, amount: nc.defaultAmount.color, minimum: nc.minimumAmount.color },
    standardDeposit: { on: !!nc.enabledFor.standard, amount: nc.defaultAmount.standard, minimum: nc.minimumAmount.standard },
    flaggedPayFull: p.deposits.flaggedClient.enabled,
    clearAfterVisits: p.flags.clearAfterOnTimeVisits,
    lateCancelFee: p.fees.lateCancel.defaultCharge,
    noShowFee: p.fees.noShow.defaultCharge,
    staffCanChangeDeposit: p.deposits.staffCanChange !== false,
  };
}

const money = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 5000;

/** Checks the form and merges it into the stored policy (everything else is kept). */
export function applyForm(p: PolicySettings, f: PolicyForm): { ok: true; policy: PolicySettings } | { ok: false; error: string } {
  if (!Number.isInteger(f.lateCancelWindowHours) || f.lateCancelWindowHours < 0 || f.lateCancelWindowHours > 168) return { ok: false, error: "Late-cancel notice must be 0 to 168 hours." };
  for (const [name, d] of [["Color", f.colorDeposit], ["Other services", f.standardDeposit]] as const) {
    if (!money(d.amount) || !money(d.minimum)) return { ok: false, error: `${name} deposit: enter amounts from $0 to $5,000.` };
    if (d.minimum > d.amount) return { ok: false, error: `${name} deposit: the minimum can't be more than the usual amount.` };
    if (d.on && d.amount === 0) return { ok: false, error: `${name} deposit: enter an amount, or switch it off.` };
  }
  if (f.clearAfterVisits !== null && (!Number.isInteger(f.clearAfterVisits) || f.clearAfterVisits < 1 || f.clearAfterVisits > 20)) return { ok: false, error: "Flags clear after 1 to 20 on-time visits (or only by hand)." };
  const fee = (v: string) => (v === "none" ? "none" : "full") as "full" | "none";
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    ok: true,
    policy: {
      ...p,
      lateCancelWindowHours: f.lateCancelWindowHours,
      deposits: {
        ...p.deposits,
        newClient: {
          ...p.deposits.newClient,
          enabledFor: { color: !!f.colorDeposit.on, standard: !!f.standardDeposit.on },
          defaultAmount: { color: round(f.colorDeposit.amount), standard: round(f.standardDeposit.amount) },
          minimumAmount: { color: round(f.colorDeposit.minimum), standard: round(f.standardDeposit.minimum) },
        },
        flaggedClient: { ...p.deposits.flaggedClient, enabled: !!f.flaggedPayFull },
        staffCanChange: !!f.staffCanChangeDeposit,
      },
      flags: { ...p.flags, clearAfterOnTimeVisits: f.clearAfterVisits },
      fees: {
        ...p.fees,
        lateCancel: { ...p.fees.lateCancel, defaultCharge: fee(f.lateCancelFee) },
        noShow: { ...p.fees.noShow, defaultCharge: fee(f.noShowFee) },
      },
    },
  };
}
