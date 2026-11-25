/** All money values inside the engine are integer cents. */
export type Cents = number;

export type DepositCategory = "color" | "standard";
export type ChargeDefault = "none" | "full" | "full_if_inside_window_else_none";
export type FlagType = "late_cancel" | "no_show";

/** Mirrors seed/policies.json (dollar values there). */
export interface PolicySettings {
  cardOnFileRequired: boolean;
  lateCancelWindowHours: number;
  deposits: {
    newClient: {
      enabledFor: Record<DepositCategory, boolean>;
      defaultAmount: Record<DepositCategory, number>;
      minimumAmount: Record<DepositCategory, number>;
      allowFullPrice: boolean;
    };
    flaggedClient: {
      enabled: boolean;
      appliesTo: "all_services";
      amount: "full";
    };
    appliedToFinalBill: boolean;
    refundIfCancelledOutsideWindow: boolean;
  };
  flags: {
    createOn: FlagType[];
    /** Flag clears after this many on-time visits following it. null = never by visits. */
    clearAfterOnTimeVisits: number | null;
    /** Optional time limit. null = no time limit. */
    activeForDays: number | null;
    stylistCanClearManually: boolean;
    stylistCanMakePermanent: boolean;
  };
  fees: {
    lateCancel: { defaultCharge: "full" | "none"; autoCharge: boolean };
    noShow: { defaultCharge: "full" | "none"; autoCharge: boolean };
    percentPresets: number[];
  };
  stylistInitiatedCancel: {
    promptForCharge: boolean;
    reasons: {
      key: string;
      label: string;
      defaultCharge: ChargeDefault;
      refundDeposit?: boolean;
    }[];
  };
  bookingAlerts: {
    notifyOnBookingBy: ("active" | "permanent" | "history")[];
    showOnCalendar: boolean;
  };
}

export interface BookedService {
  serviceKey: string;
  depositCategory: DepositCategory;
  /** Estimated price for this line. */
  estimatedPrice: Cents;
}

/** A violation on the client's record. Never deleted. */
export interface ClientFlag {
  id: string;
  type: FlagType;
  createdAt: Date;
  /** Start time of the appointment that caused it. */
  appointmentStart: Date;
  /** Services on that appointment, for the history view. */
  appointmentSummary?: string;
  /** Fee charged for it, if any. */
  feeCharged?: Cents;
  /** Stylist marked it permanent: never clears. */
  permanent: boolean;
  /** Stylist cleared it by hand (with a note). */
  clearedAt?: Date | null;
  clearNote?: string | null;
}

export interface ClientPolicyState {
  /** Start times of completed, on-time appointments in this app. */
  onTimeVisits: Date[];
  /** Visits completed before import (e.g. StyleSeat). */
  priorVisitCount: number;
  flags: ClientFlag[];
  /** Standing per-client deposit rule set by the stylist. */
  depositOverride?: { kind: "amount"; amount: Cents } | { kind: "full" } | null;
  outstandingBalance: Cents;
}
