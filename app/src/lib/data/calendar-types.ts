import type { ServiceRow } from "../booking/build";
import type { Hours } from "../context";
import type { PolicySettings } from "../policy/types";
import type { BundleRule } from "../pricing/discounts";
import type { ClientStateJSON } from "./clients-shared";

/** Shapes passed from the server to the calendar screens (JSON-safe). */

export interface CalAppointment {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  start: string; // ISO
  end: string;
  status: string;
  notes: string | null;
  depositRequired: number;
  depositPaid: number;
  services: { name: string; listPrice: number; finalPrice: number; discounts: { label: string; amount_cents: number }[] }[];
  /** Hands-on time; the rest of [start, end) is processing (open). */
  busy: { phase: string; start: string; end: string }[];
}

export interface CalClient {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
}

export interface CalendarData {
  businessName: string;
  timezone: string;
  hours: Hours;
  policy: PolicySettings;
  rules: BundleRule[];
  stages: Record<string, number>;
  view: "day" | "week";
  from: string; // first visible day (YYYY-MM-DD)
  days: number;
  today: string;
  appointments: CalAppointment[];
  clientStates: Record<string, ClientStateJSON>;
  services: (ServiceRow & { category: string; categorySort: number; sort: number; bookable_online: boolean })[];
  clients: CalClient[];
}
