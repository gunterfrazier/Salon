import type { PolicySettings } from "./types";

const money = (d: number) => `$${d % 1 ? d.toFixed(2) : d}`;

/**
 * The booking policy clients agree to, written from the salon's settings so
 * the wording always matches what the app enforces.
 */
export function policyText(p: PolicySettings): string[] {
  const lines: string[] = [];
  const window = `${p.lateCancelWindowHours} hours`;
  const nc = p.deposits.newClient;

  if (nc.enabledFor.color || nc.enabledFor.standard) {
    if (nc.enabledFor.color && nc.enabledFor.standard && nc.defaultAmount.color !== nc.defaultAmount.standard) {
      lines.push(`New clients pay a deposit to book: ${money(nc.defaultAmount.color)} for color services, ${money(nc.defaultAmount.standard)} for other services (never more than the service total).`);
    } else {
      const which = nc.enabledFor.color && nc.enabledFor.standard ? "any service" : nc.enabledFor.color ? "color services" : "non-color services";
      const amount = nc.enabledFor.color ? nc.defaultAmount.color : nc.defaultAmount.standard;
      lines.push(`New clients pay a ${money(amount)} deposit to book ${which} (never more than the service total).`);
    }
  }
  lines.push("Deposits count toward your total on the day of your appointment.");
  if (p.deposits.refundIfCancelledOutsideWindow) lines.push(`Cancel at least ${window} ahead and your deposit is refunded.`);

  const charge = (c: "full" | "none") => (c === "full" ? "the full price of the booked services" : "no fee");
  lines.push(`Cancelling with less than ${window} notice is charged ${charge(p.fees.lateCancel.defaultCharge)}.`);
  lines.push(`Missing your appointment without notice (no-show) is charged ${charge(p.fees.noShow.defaultCharge)}.`);
  if (p.deposits.flaggedClient.enabled) {
    const n = p.flags.clearAfterOnTimeVisits;
    lines.push(`After a late cancellation or no-show, future bookings must be paid in full in advance${n ? ` until ${n} on-time visits` : ""}.`);
  }
  lines.push("Any unpaid fee must be settled before your next booking.");
  return lines;
}

/** Short fingerprint of the policy wording, stored with each client's agreement. */
export function policyVersion(lines: string[]): string {
  let h = 5381;
  for (const ch of lines.join("\n")) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `v-${h.toString(36)}`;
}
