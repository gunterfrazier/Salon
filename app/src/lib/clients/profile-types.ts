import type { ClientStateJSON } from "../data/clients-shared";
import type { PolicySettings } from "../policy/types";
import type { Favorites } from "../booking/search";

/** Everything the client profile page shows (JSON-safe). */
export interface ClientProfileData {
  /** What the signed-in team member may do here. */
  can: { edit: boolean; policy: boolean; formulas: boolean; checkout: boolean };
  timezone: string;
  policy: PolicySettings;
  paymentMethods: { key: string; label: string }[];
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    priorVisitCount: number;
    /** Agreed to get texts (online bookers agree when booking). */
    smsOptIn: boolean;
    source: string;
    createdAt: string;
    depositOverride: "none" | "amount" | "full";
    depositOverrideCents: number | null;
    favorites: Favorites | null;
  };
  /** Services that can be picked as favorites. */
  services: { id: string; name: string; category: string }[];
  state: ClientStateJSON;
  /** Extra details for each flag in state.flags, by id. */
  flagNotes: Record<string, { clearNote: string | null; madePermanentAt: string | null }>;
  balances: { id: string; amount: number; reason: string; createdAt: string; settled: boolean }[];
  refundsOwed: { id: string; amount: number; note: string | null; createdAt: string }[];
  visits: {
    id: string;
    start: string;
    status: string;
    services: string[];
    total: number;
    paid: number;
    cancelReason: string | null;
  }[];
  formulas: {
    id: string;
    createdAt: string;
    formula: string;
    developer: string | null;
    processingMin: number | null;
    notes: string | null;
    photos: { path: string; url: string | null }[];
    /** Products used, from inventory. */
    usage: { productId: string; label: string; amount: number | null; unit: string | null; containers: number; kind: string }[];
  }[];
  /** Inventory products to pick from when recording usage. */
  products: { id: string; label: string; size: number | null; unit: "oz" | "ml" | "g" | "each"; kind: string; onHand: number }[];
}
