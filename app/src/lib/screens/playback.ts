/**
 * Which slide a screen shows, worked out from the clock so every TV on the
 * same screen stays in step, plus the remote's next/back/pause and the
 * screen's schedule.
 */

/** Seconds counted from a fixed starting point (2026-01-01 UTC). */
const EPOCH = Date.UTC(2026, 0, 1) / 1000;

export interface Control {
  /** Seconds added to the clock (next/back move this). */
  shift: number;
  /** While paused: the clock time (ms) it was paused at. */
  pausedAt: number | null;
  /** "Play something else": another screen's playlist until a time (ms). */
  override: { screenId: string; until: number } | null;
}

export const NO_CONTROL: Control = { shift: 0, pausedAt: null, override: null };

export function cleanControl(raw: unknown): Control {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const o = r.override as Record<string, unknown> | null | undefined;
  return {
    shift: num(r.shift) ?? 0,
    pausedAt: num(r.pausedAt),
    override: o && typeof o.screenId === "string" && /^[0-9a-f-]{36}$/.test(o.screenId) && num(o.until) ? { screenId: o.screenId, until: num(o.until)! } : null,
  };
}

export interface Position {
  index: number;
  /** How many times the playlist has looped (changes the review, photos and products shown). */
  lap: number;
  /** Seconds left on this slide. */
  remaining: number;
  /** Seconds already shown. */
  elapsed: number;
}

/** The slide showing at a moment (ms), for a playlist of slide lengths (seconds). */
export function playPosition(seconds: number[], nowMs: number, c: Pick<Control, "shift" | "pausedAt">): Position {
  if (!seconds.length) return { index: 0, lap: 0, remaining: 0, elapsed: 0 };
  const total = seconds.reduce((a, b) => a + b, 0);
  const at = (c.pausedAt ?? nowMs) / 1000 - EPOCH + c.shift;
  const lap = Math.floor(at / total);
  let t = at - lap * total;
  for (let i = 0; i < seconds.length; i++) {
    if (t < seconds[i]) return { index: i, lap, remaining: seconds[i] - t, elapsed: t };
    t -= seconds[i];
  }
  return { index: 0, lap, remaining: seconds[0], elapsed: 0 };
}

/** Skip to the start of the next slide. */
export function nextControl(seconds: number[], nowMs: number, c: Control): Control {
  const p = playPosition(seconds, nowMs, c);
  return { ...c, shift: c.shift + p.remaining + 0.05 };
}

/** Back to the start of the previous slide (or this one's start if it just began). */
export function backControl(seconds: number[], nowMs: number, c: Control): Control {
  if (!seconds.length) return c;
  const p = playPosition(seconds, nowMs, c);
  const prev = seconds[(p.index - 1 + seconds.length) % seconds.length];
  return { ...c, shift: c.shift - p.elapsed - (p.elapsed < 2 ? prev : 0) + 0.05 };
}

/** Jump straight to a slide. */
export function jumpControl(seconds: number[], nowMs: number, c: Control, index: number): Control {
  const p = playPosition(seconds, nowMs, c);
  const start = (i: number) => seconds.slice(0, i).reduce((a, b) => a + b, 0);
  return { ...c, shift: c.shift + (start(index) - (start(p.index) + p.elapsed)) + 0.05 };
}

export function pauseControl(nowMs: number, c: Control): Control {
  return c.pausedAt ? c : { ...c, pausedAt: nowMs };
}

export function playControl(nowMs: number, c: Control): Control {
  if (!c.pausedAt) return c;
  return { ...c, pausedAt: null, shift: c.shift - (nowMs - c.pausedAt) / 1000 };
}

// --- Schedule ----------------------------------------------------------------

export interface ScheduleRule {
  id: string;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  from: string;
  to: string;
  /** Show this other screen's playlist. */
  screenId: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

export function cleanSchedule(raw: unknown): ScheduleRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 20)
    .map((r) => r as Record<string, unknown>)
    .filter((r) => r && typeof r.screenId === "string" && /^[0-9a-f-]{36}$/.test(r.screenId) && typeof r.from === "string" && HHMM.test(r.from) && typeof r.to === "string" && HHMM.test(r.to) && r.from !== r.to)
    .map((r) => ({
      id: typeof r.id === "string" && /^[a-z0-9]{4,16}$/.test(r.id) ? r.id : Math.random().toString(36).slice(2, 10),
      days: Array.isArray(r.days) ? [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [],
      from: r.from as string,
      to: r.to as string,
      screenId: r.screenId as string,
    }))
    .filter((r) => r.days.length > 0);
}

/**
 * The rule running at a moment (weekday 0–6, minutes after midnight), or null.
 * Overnight rules (from 19:00 to 09:00) belong to the day they start on.
 */
export function ruleNow(rules: ScheduleRule[], day: number, minute: number): ScheduleRule | null {
  for (const r of rules) {
    const a = mins(r.from);
    const b = mins(r.to);
    if (a < b) {
      if (r.days.includes(day) && minute >= a && minute < b) return r;
    } else {
      if (r.days.includes(day) && minute >= a) return r;
      if (r.days.includes((day + 6) % 7) && minute < b) return r;
    }
  }
  return null;
}

export type Source = { screenId: string; why: "override" | "schedule" | "closed" | "own"; until?: number };

/**
 * Whose playlist plays: the remote's "play something else" first, then the
 * schedule, then the "when closed" choice, then the screen's own.
 */
export function playlistSource(own: string, c: Control, rules: ScheduleRule[], whenClosed: string | null, at: { nowMs: number; day: number; minute: number; closed: boolean }): Source {
  if (c.override && c.override.until > at.nowMs) return { screenId: c.override.screenId, why: "override", until: c.override.until };
  const r = ruleNow(rules, at.day, at.minute);
  if (r) return { screenId: r.screenId, why: "schedule" };
  if (whenClosed && at.closed) return { screenId: whenClosed, why: "closed" };
  return { screenId: own, why: "own" };
}
