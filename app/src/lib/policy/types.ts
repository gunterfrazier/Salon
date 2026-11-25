/** All money values inside the engine are integer cents. */
export type Cents = number;

export type DepositCategory = "color" | "standard";
export type ChargeDefault = "none" | "full" | "full_if_inside_window_else_none";
export type FlagType = "late_cancel" | "no_show";

/** Mirrors seed/policies.json (dollar values there, converted with fromSettings). */
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
      defaultAmount: number;
      minimumAmount: number;
      allowFullPrice: boolean;
    };
    appliedToFinalBill: boolean;
    refundIfCancelledOutsideWindow: boolean;
  };
  flags: {
    createOn: FlagType[];
    activeForDays: number;
    autoClearAfterOnTimeVisits: number | null;
    stylistCanClearManually: boolean;
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
}

export interface BookedService {
  serviceKey: string;
  depositCategory: DepositCategory;
  /** Estimated price for this line, including length surcharge. */
  estimatedPrice: Cents;
}

export interface ClientFlag {
  type: FlagType;
  createdAt: Date;
  expiresAt: Date;
  clearedAt?: Date | null;
}

export interface ClientPolicyState {
  completedVisits: number;
  flags: ClientFlag[];
  /** Standing per-client deposit rule set by the stylist. */
  depositOverride?: { kind: "amount"; amount: Cents } | { kind: "full" } | null;
  outstandingBalance: Cents;
}
