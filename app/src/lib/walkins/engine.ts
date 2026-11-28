/**
 * Walk-ins: the salon's rules, who takes the next person, and how long the
 * wait is. Pure: the server passes in stylists' busy time and the line.
 */

export interface WalkinSettings {
  /** Off; alongside appointments; or walk-ins only (barbershop style). */
  mode: "off" | "both" | "only";
  /** People can join the line from the salon page. */
  joinOnline: boolean;
  /** Who takes walk-ins: everyone who takes appointments, commission stylists only, or a chosen list. */
  who: "everyone" | "commission" | "list";
  list: string[];
  /** How the next walk-in is given out (a requested stylist always comes first). */
  method: "soonest" | "fixed" | "rotation" | "balanced";
  /** Order for "fixed" (first free on the list) and the tie-break for rotation. */
  order: string[];
  /** When turn counts start over. */
  reset: "daily" | "weekly" | "never";
  /** What a walk-in counts as: one turn each, quick services as half, by minutes, or by dollars. */
  turns: "visit" | "half_quick" | "minutes" | "dollars";
  quickMinutes: number;
}

export const DEFAULT_WALKINS: WalkinSettings = { mode: "off", joinOnline: false, who: "everyone", list: [], method: "soonest", order: [], reset: "daily", turns: "visit", quickMinutes: 20 };

const UUID = /^[0-9a-f-]{36}$/i;
const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 100) : []);
const pick = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);

export function cleanWalkinSettings(raw: unknown): WalkinSettings {
  const r = (raw ?? {}) as Partial<WalkinSettings>;
  return {
    mode: pick(r.mode, ["off", "both", "only"] as const, DEFAULT_WALKINS.mode),
    joinOnline: r.joinOnline === true,
    who: pick(r.who, ["everyone", "commission", "list"] as const, DEFAULT_WALKINS.who),
    list: ids(r.list),
    method: pick(r.method, ["soonest", "fixed", "rotation", "balanced"] as const, DEFAULT_WALKINS.method),
    order: ids(r.order),
    reset: pick(r.reset, ["daily", "weekly", "never"] as const, DEFAULT_WALKINS.reset),
    turns: pick(r.turns, ["visit", "half_quick", "minutes", "dollars"] as const, DEFAULT_WALKINS.turns),
    quickMinutes: typeof r.quickMinutes === "number" && r.quickMinutes >= 5 && r.quickMinutes <= 120 ? Math.round(r.quickMinutes) : DEFAULT_WALKINS.quickMinutes,
  };
}

/** How much one walk-in counts toward a stylist's turns. */
export function turnWeight(s: Pick<WalkinSettings, "turns" | "quickMinutes">, minutes: number, priceCents: number): number {
  if (s.turns === "half_quick") return minutes <= s.quickMinutes ? 0.5 : 1;
  if (s.turns === "minutes") return Math.round((minutes / 60) * 100) / 100;
  if (s.turns === "dollars") return Math.round(priceCents) / 100;
  return 1;
}

/** The first day of the current turn period (null: never resets). Week starts Sunday. */
export function periodStart(reset: WalkinSettings["reset"], today: string, weekdayOfToday: number): string | null {
  if (reset === "never") return null;
  if (reset === "daily") return today;
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weekdayOfToday);
  return d.toISOString().slice(0, 10);
}

export interface StylistState {
  id: string;
  name: string;
  /** Can take walk-ins who didn't ask for anyone (the salon's rule). */
  inRotation: boolean;
  /** Services they do (null: all). */
  serviceIds: string[] | null;
  /** Busy from now on (appointments, a client in the chair, breaks), ms. */
  busy: { start: number; end: number }[];
  /** End of their working day today, ms (null: not working today). */
  dayEnd: number | null;
  /** Turns so far this period. */
  turns: number;
}

export interface WaitingPerson {
  id: string;
  requested: string | null;
  serviceIds: string[];
  minutes: number;
  weight: number;
}

const offers = (s: StylistState, serviceIds: string[]) => !s.serviceIds || serviceIds.every((id) => s.serviceIds!.includes(id));

/** Earliest start from `from` with `minutes` free before the next busy time and the end of the day. */
export function earliestStart(busy: { start: number; end: number }[], dayEnd: number | null, from: number, minutes: number): number | null {
  if (dayEnd === null) return null;
  const len = minutes * 60_000;
  let t = from;
  for (const b of [...busy].sort((x, y) => x.start - y.start)) {
    if (b.end <= t) continue;
    if (b.start >= t + len) break;
    t = Math.max(t, b.end);
  }
  return t + len <= dayEnd ? t : null;
}

export interface Prediction {
  /** Each person in line: who will likely take them and when (null: not today). */
  people: { id: string; staffId: string | null; start: number | null }[];
  /** Each stylist: when a new walk-in could start with them (null: not today). */
  stylists: { id: string; next: number | null }[];
  /** A new walk-in asking for anyone. */
  anyone: { staffId: string | null; start: number | null };
}

/**
 * Walk the line in order, giving each person to the stylist the salon's rule
 * picks among those who can start soonest (fixed: first on the list who's
 * free; rotation: fewest turns, ties by the order; balanced: fewest turns, even
 * if they're free up to 15 minutes later; soonest: whoever is free first).
 */
export function predictLine(stylists: StylistState[], line: WaitingPerson[], s: WalkinSettings, now: number, newMinutes = 30): Prediction {
  const busy = new Map(stylists.map((st) => [st.id, [...st.busy]]));
  const turns = new Map(stylists.map((st) => [st.id, st.turns]));
  const rank = (id: string) => {
    const i = s.order.indexOf(id);
    return i < 0 ? 1000 + stylists.findIndex((x) => x.id === id) : i;
  };

  const place = (p: Pick<WaitingPerson, "requested" | "serviceIds" | "minutes">): { staffId: string | null; start: number | null } => {
    if (p.requested) {
      const st = stylists.find((x) => x.id === p.requested);
      if (!st) return { staffId: p.requested, start: null };
      return { staffId: st.id, start: earliestStart(busy.get(st.id)!, st.dayEnd, now, p.minutes) };
    }
    const options = stylists
      .filter((st) => st.inRotation && offers(st, p.serviceIds))
      .map((st) => ({ st, start: earliestStart(busy.get(st.id)!, st.dayEnd, now, p.minutes) }))
      .filter((o): o is { st: StylistState; start: number } => o.start !== null);
    if (!options.length) return { staffId: null, start: null };
    const soonest = Math.min(...options.map((o) => o.start));
    const slack = s.method === "balanced" ? 15 : s.method === "soonest" ? 0 : 5;
    const ready = options.filter((o) => o.start <= soonest + slack * 60_000);
    const best = ready.sort((a, b) => {
      if (s.method === "fixed") return rank(a.st.id) - rank(b.st.id) || a.start - b.start;
      if (s.method === "rotation") return turns.get(a.st.id)! - turns.get(b.st.id)! || rank(a.st.id) - rank(b.st.id);
      if (s.method === "balanced") return turns.get(a.st.id)! - turns.get(b.st.id)! || a.start - b.start || rank(a.st.id) - rank(b.st.id);
      return a.start - b.start || turns.get(a.st.id)! - turns.get(b.st.id)! || rank(a.st.id) - rank(b.st.id);
    })[0];
    return { staffId: best.st.id, start: best.start };
  };

  const people: Prediction["people"] = [];
  for (const p of line) {
    const r = place(p);
    people.push({ id: p.id, ...r });
    if (r.staffId && r.start !== null) {
      busy.get(r.staffId)?.push({ start: r.start, end: r.start + p.minutes * 60_000 });
      turns.set(r.staffId, (turns.get(r.staffId) ?? 0) + p.weight);
    }
  }
  return {
    people,
    stylists: stylists.map((st) => ({ id: st.id, next: earliestStart(busy.get(st.id)!, st.dayEnd, now, newMinutes) })),
    anyone: place({ requested: null, serviceIds: [], minutes: newMinutes }),
  };
}

/** "No wait", or a range like "about 10–20 min" (honest: it's an estimate). */
export function waitLabel(start: number | null, now: number): string {
  if (start === null) return "Not today";
  const m = Math.max(0, Math.round((start - now) / 60_000));
  if (m < 5) return "No wait";
  const lo = Math.floor(m / 5) * 5;
  if (lo >= 120) return `about ${Math.round(m / 60)} hr`;
  return `about ${lo}–${lo + 10} min`;
}
