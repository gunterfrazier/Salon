import type { ServiceRow } from "../booking/build";
import type { Stylist } from "../staff/stylists";
import type { Hours } from "../context";
import type { PolicySettings } from "../policy/types";
import type { BundleRule } from "../pricing/discounts";
import type { DayOff, HolidayRule } from "../schedule/holidays";
import type { Favorites } from "../booking/search";
import type { ClientStateJSON } from "./clients-shared";

/** Shapes passed from the server to the calendar screens (JSON-safe). */

export interface CalAppointment {
  id: string;
  /** The stylist doing it. */
  staffId: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  start: string; // ISO
  end: string;
  status: string;
  notes: string | null;
  /** The client asked for a quiet visit (this one, or always). */
  quiet?: boolean;
  depositRequired: number;
  depositPaid: number;
  services: { id: string; serviceId: string; name: string; priceType: string; listPrice: number; finalPrice: number; discounts: { label: string; amount_cents: number }[] }[];
  /** Hands-on time; the rest of [start, end) is processing (open). */
  busy: { phase: string; start: string; end: string }[];
}

/** Payment methods the stylist can record by hand at checkout. */
export interface ManualMethod {
  key: string;
  label: string;
}

export interface CalClient {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  favorites: Favorites | null;
}

export interface CalendarData {
  /** What the signed-in team member may do on the calendar. */
  can: { book: boolean; checkout: boolean; all: boolean };
  /** Stylists who take appointments (calendar filter, booking). */
  stylists: Stylist[];
  /** Names for every team member, including former stylists on old appointments. */
  staffNames: Record<string, string>;
  /** Showing one stylist's book, or null for everyone. */
  viewStaff: string | null;
  /** The signed-in team member's own staff id. */
  me: string;
  businessName: string;
  timezone: string;
  hours: Hours;
  policy: PolicySettings;
  rules: BundleRule[];
  stages: Record<string, number>;
  view: "day" | "week" | "month";
  from: string; // first visible day (YYYY-MM-DD)
  days: number;
  today: string;
  appointments: CalAppointment[];
  clientStates: Record<string, ClientStateJSON>;
  services: (ServiceRow & { category: string; categorySort: number; sort: number; bookable_online: boolean })[];
  clients: CalClient[];
  paymentMethods: ManualMethod[];
  /** Holiday rules (merged with defaults). */
  holidays: HolidayRule[];
  /** One-time days off / blocked hours from the visible range through the next year. */
  daysOff: DayOff[];
}
