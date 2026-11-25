import type { Cents, DepositCategory } from "../policy/types";

/** A service as defined in seed/service-menu.json (dollar prices). */
export interface MenuService {
  key: string;
  name: string;
  priceType: "fixed" | "starting_at" | "hourly" | "free";
  price: number;
  estimatedHours?: number;
  active: number;
  processing: number;
  finish: number;
  depositCategory: DepositCategory;
  stage: string;
  /** What this service already covers, e.g. ["color","cut","style"]. */
  includes?: string[];
  isAddOn?: boolean;
  allowBookingInProcessing?: boolean;
}

export type Phase = "active" | "processing" | "finish";

export interface Segment {
  phase: Phase;
  start: Date;
  end: Date;
}

export interface PlannedLine {
  serviceKey: string;
  name: string;
  price: Cents;
  priceType: MenuService["priceType"];
  depositCategory: DepositCategory;
  start: Date;
  end: Date;
  segments: Segment[];
}

export interface PlanWarning {
  kind: "already_included" | "add_on_alone";
  serviceKey: string;
  message: string;
}

export interface AppointmentPlan {
  start: Date;
  end: Date;
  totalMinutes: number;
  /** Sum of every line; each line is billed separately. */
  estimatedTotal: Cents;
  /** True if any line is "starting at" or hourly, so the total may change at checkout. */
  priceMayVary: boolean;
  lines: PlannedLine[];
  /** Stylist is hands-on: these are blocked on the calendar. */
  busy: { start: Date; end: Date }[];
  /** Processing time when another client can be booked. */
  openGaps: { start: Date; end: Date }[];
  warnings: PlanWarning[];
}

const MIN = 60_000;
const add = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MIN);

export function linePrice(s: MenuService): Cents {
  if (s.priceType === "free") return 0;
  if (s.priceType === "hourly") return Math.round(s.price * (s.estimatedHours ?? 1) * 100);
  return Math.round(s.price * 100);
}

/** Default order for stacked services: chemical → treatment → cut → style → wax → fees. */
export function suggestOrder(services: MenuService[], stages: Record<string, number>): MenuService[] {
  return services
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (stages[a.s.stage] ?? 5) - (stages[b.s.stage] ?? 5) || a.i - b.i)
    .map(({ s }) => s);
}

function mergeRanges(ranges: { start: Date; end: Date }[]) {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: { start: Date; end: Date }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start.getTime() <= last.end.getTime()) {
      if (r.end > last.end) last.end = r.end;
    } else out.push({ ...r });
  }
  return out;
}

/**
 * Stack services into one appointment, back to back, in the order given.
 * Each service keeps its own active / processing / finish phases, so the
 * appointment length is the sum of every service's time.
 */
export function planAppointment(start: Date, services: MenuService[]): AppointmentPlan {
  if (services.length === 0) throw new Error("Pick at least one service.");

  const lines: PlannedLine[] = [];
  const warnings: PlanWarning[] = [];
  const covered = new Set<string>();
  let cursor = start;

  for (const s of services) {
    const overlap = (s.includes ?? []).filter((x) => covered.has(x));
    if (overlap.length && overlap.length === (s.includes ?? []).length) {
      warnings.push({
        kind: "already_included",
        serviceKey: s.key,
        message: `${s.name}: a ${overlap.join(" and ")} is already included in another service on this appointment.`,
      });
    }
    (s.includes ?? []).forEach((x) => covered.add(x));

    const segments: Segment[] = [];
    for (const phase of ["active", "processing", "finish"] as const) {
      const m = s[phase];
      if (m > 0) {
        segments.push({ phase, start: cursor, end: add(cursor, m) });
        cursor = add(cursor, m);
      }
    }
    lines.push({
      serviceKey: s.key,
      name: s.name,
      price: linePrice(s),
      priceType: s.priceType,
      depositCategory: s.depositCategory,
      start: segments[0]?.start ?? cursor,
      end: cursor,
      segments,
    });
  }

  if (services.every((s) => s.isAddOn)) {
    warnings.push({ kind: "add_on_alone", serviceKey: services[0].key, message: "Add-ons need to be booked with a main service." });
  }

  const busy = mergeRanges(lines.flatMap((l, i) =>
    l.segments
      .filter((g) => g.phase !== "processing" || services[i].allowBookingInProcessing === false)
      .map(({ start, end }) => ({ start, end })),
  ));
  const openGaps = lines.flatMap((l, i) =>
    services[i].allowBookingInProcessing === false
      ? []
      : l.segments.filter((g) => g.phase === "processing").map(({ start, end }) => ({ start, end })),
  );

  return {
    start,
    end: cursor,
    totalMinutes: (cursor.getTime() - start.getTime()) / MIN,
    estimatedTotal: lines.reduce((sum, l) => sum + l.price, 0),
    priceMayVary: services.some((s) => s.priceType === "starting_at" || s.priceType === "hourly"),
    lines,
    busy,
    openGaps,
    warnings,
  };
}
