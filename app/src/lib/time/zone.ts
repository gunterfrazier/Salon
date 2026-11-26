/**
 * Salon-local time helpers. The salon's time zone (e.g. America/Chicago) is
 * the source of truth for "what day / what time" a stylist sees; the database
 * stores UTC instants. No date library: Intl handles time zones and DST.
 */

/** A calendar day as YYYY-MM-DD. */
export type DateStr = string;

const pad = (n: number) => String(n).padStart(2, "0");

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a time zone. */
export function wallParts(d: Date, tz: string) {
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return {
    date: `${p.year}-${p.month}-${p.day}` as DateStr,
    minutes: hour * 60 + Number(p.minute),
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Offset of tz from UTC at an instant, in minutes (Chicago in winter = -360). */
export function tzOffsetMinutes(d: Date, tz: string): number {
  const w = wallParts(d, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/**
 * The instant when the wall clock in tz reads date + minutes-after-midnight.
 * During the spring-forward gap the time is moved forward (2:30 → 3:30);
 * during the fall-back overlap the first occurrence is used.
 */
export function zonedToUtc(date: DateStr, minutes: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, minutes);
  // Offsets in force half a day before and after: covers any DST change.
  const before = tzOffsetMinutes(new Date(wallAsUtc - 12 * 3600000), tz);
  const after = tzOffsetMinutes(new Date(wallAsUtc + 12 * 3600000), tz);
  const valid = [...new Set([before, after])]
    .map((off) => wallAsUtc - off * 60000)
    .filter((t) => {
      const w = wallParts(new Date(t), tz);
      return w.date === date && w.minutes === minutes;
    })
    .sort((a, b) => a - b);
  // Fall-back overlap: two valid instants, take the first.
  if (valid.length) return new Date(valid[0]);
  // Spring-forward gap: no valid instant. Using the pre-change offset lands
  // the same distance past the gap (2:30 → 3:30).
  return new Date(wallAsUtc - before * 60000);
}

/** "HH:MM" → minutes after midnight. */
export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Invalid time: ${s}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time: ${s}`);
  return h * 60 + min;
}

export const toHHMM = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

/** Calendar arithmetic on YYYY-MM-DD strings (time-zone free). */
export function addDays(date: DateStr, n: number): DateStr {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: DateStr): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Sunday that starts the week containing date. */
export const startOfWeek = (date: DateStr): DateStr => addDays(date, -weekday(date));

export const isDateStr = (s: unknown): s is DateStr => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Today's date in tz. */
export const todayIn = (tz: string, now = new Date()): DateStr => wallParts(now, tz).date;

/** "3:30 PM" in tz. */
export function formatTime(d: Date, tz: string): string {
  return d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
}

/** "Tue, Dec 1" for a date string. */
export function formatDay(date: DateStr, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${pad(m)}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
