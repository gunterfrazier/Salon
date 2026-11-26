import { rangeFor, daysBetween, type RangeKey } from "@/lib/reports/build";
import { isDateStr } from "@/lib/time/zone";

const KEYS = new Set<RangeKey>(["today", "week", "month", "last_month", "quarter", "year", "last_year", "custom"]);

/** Range from the URL (?range=… or ?range=custom&from=&to=), defaulting to this month; at most ~3 years. */
export function parseRange(sp: { range?: string; from?: string; to?: string }, today: string): { key: RangeKey; from: string; to: string } {
  const key = KEYS.has(sp.range as RangeKey) ? (sp.range as RangeKey) : sp.from && sp.to ? "custom" : "month";
  const custom = isDateStr(sp.from) && isDateStr(sp.to) ? { from: sp.from, to: sp.to } : undefined;
  const r = rangeFor(key, today, custom);
  if (daysBetween(r.from, r.to).length > 1100) return { key: "year", ...rangeFor("year", today) };
  return { key, ...r };
}
