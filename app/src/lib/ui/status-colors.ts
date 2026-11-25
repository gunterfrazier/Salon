/**
 * Color chart for client violations, warnings and appointment status.
 * Used for calendar blocks, client cards, booking alerts and the legend page.
 * Every status pairs a color with an icon and a short label, so it never
 * relies on color alone.
 *
 * Severity families:
 *   red     = violation (deposit / full payment required)
 *   amber   = warning (past violation, nothing required)
 *   purple  = money owed
 *   blue    = action needed (card / deposit not in yet)
 *   green   = good news / info
 */
export type StatusKey =
  | "permanent_flag"
  | "no_show"
  | "late_cancel"
  | "past_violation"
  | "balance_owed"
  | "card_needed"
  | "deposit_paid"
  | "new_client";

export interface StatusStyle {
  key: StatusKey;
  label: string;
  icon: string;
  family: "violation" | "warning" | "money" | "action" | "info";
  meaning: string;
  /** Background, text, border for light theme. */
  light: { bg: string; fg: string; border: string };
  dark: { bg: string; fg: string; border: string };
}

export const STATUS_CHART: StatusStyle[] = [
  {
    key: "permanent_flag",
    label: "Permanent flag",
    icon: "⛔",
    family: "violation",
    meaning: "Never clears. Full payment required for every booking.",
    light: { bg: "#7F1D1D", fg: "#FFFFFF", border: "#450A0A" },
    dark: { bg: "#991B1B", fg: "#FFFFFF", border: "#FCA5A5" },
  },
  {
    key: "no_show",
    label: "No-show (active)",
    icon: "✖",
    family: "violation",
    meaning: "Missed an appointment. Full payment required until cleared by on-time visits.",
    light: { bg: "#FEE2E2", fg: "#991B1B", border: "#DC2626" },
    dark: { bg: "#450A0A", fg: "#FECACA", border: "#EF4444" },
  },
  {
    key: "late_cancel",
    label: "Late cancel (active)",
    icon: "⏱",
    family: "violation",
    meaning: "Cancelled with less than 24 hours' notice. Full payment required until cleared.",
    light: { bg: "#FFEDD5", fg: "#9A3412", border: "#EA580C" },
    dark: { bg: "#431407", fg: "#FED7AA", border: "#F97316" },
  },
  {
    key: "past_violation",
    label: "Past violation",
    icon: "⚠",
    family: "warning",
    meaning: "Flagged before but cleared. Warning only; no deposit required.",
    light: { bg: "#FEF9C3", fg: "#854D0E", border: "#CA8A04" },
    dark: { bg: "#422006", fg: "#FEF08A", border: "#EAB308" },
  },
  {
    key: "balance_owed",
    label: "Balance owed",
    icon: "$",
    family: "money",
    meaning: "Unpaid fee. Must be paid before the next booking.",
    light: { bg: "#F3E8FF", fg: "#6B21A8", border: "#9333EA" },
    dark: { bg: "#3B0764", fg: "#E9D5FF", border: "#A855F7" },
  },
  {
    key: "card_needed",
    label: "Card / deposit needed",
    icon: "💳",
    family: "action",
    meaning: "Client hasn't added a card or paid the deposit yet.",
    light: { bg: "#DBEAFE", fg: "#1E40AF", border: "#2563EB" },
    dark: { bg: "#172554", fg: "#BFDBFE", border: "#3B82F6" },
  },
  {
    key: "deposit_paid",
    label: "Deposit paid",
    icon: "✓",
    family: "info",
    meaning: "Deposit received and applied to the final bill.",
    light: { bg: "#DCFCE7", fg: "#166534", border: "#16A34A" },
    dark: { bg: "#052E16", fg: "#BBF7D0", border: "#22C55E" },
  },
  {
    key: "new_client",
    label: "New client",
    icon: "★",
    family: "info",
    meaning: "First visit.",
    light: { bg: "#CCFBF1", fg: "#115E59", border: "#0D9488" },
    dark: { bg: "#042F2E", fg: "#99F6E4", border: "#14B8A6" },
  },
];

export const STATUS: Record<StatusKey, StatusStyle> = Object.fromEntries(
  STATUS_CHART.map((s) => [s.key, s]),
) as Record<StatusKey, StatusStyle>;

/** Calendar block phases. */
export const PHASE_CHART = [
  { key: "active", label: "Hands-on time", meaning: "You're busy with this client.", pattern: "solid" },
  { key: "processing", label: "Processing", meaning: "Color is developing. Open for a short service.", pattern: "striped" },
  { key: "finish", label: "Finish", meaning: "Rinse, cut, style.", pattern: "solid" },
] as const;
