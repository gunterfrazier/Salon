import seedJson from "../../../seed/payment-methods.json";
import type { PaymentMethod } from "./methods";

/** Every method the app supports, with defaults (all off except cash). */
export const SEED_METHODS = seedJson.methods as PaymentMethod[];

/** Stored per business in businesses.payment_methods = { methods: [...] }. */
export type StoredMethods = { methods?: Partial<PaymentMethod>[] } | null | undefined;

/** Seed list with the salon's saved on/off switches and handles applied. */
export function mergeMethods(stored: StoredMethods): PaymentMethod[] {
  const byKey = new Map((stored?.methods ?? []).filter((m) => m.key).map((m) => [m.key!, m]));
  return SEED_METHODS.map((m) => {
    const s = byKey.get(m.key);
    return { ...m, enabled: s?.enabled ?? m.enabled, handle: s?.handle ?? m.handle ?? "" };
  });
}

/** Methods clients can use to send a deposit themselves (enabled, with a handle where needed). */
export function depositMethods(methods: PaymentMethod[]): PaymentMethod[] {
  return methods.filter((m) => m.provider === "manual" && m.key !== "cash" && m.enabled && (m.setup !== "handle" || !!m.handle));
}

/** Not wired up yet: these can't be switched on. */
export const NOT_YET_AVAILABLE = new Set(SEED_METHODS.filter((m) => m.provider !== "manual").map((m) => m.key));
