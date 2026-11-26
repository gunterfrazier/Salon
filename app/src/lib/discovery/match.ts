/**
 * Matching services across salons. Every salon names its own menu, so a
 * search for "women's cut" (or the services from a client's last visit
 * elsewhere) is matched to each salon's closest service by name.
 */

const STOP = new Set(["and", "the", "a", "with", "for", "of", "&", "service", "services"]);
/** Common ways people say the same thing. */
const SAME: Record<string, string> = { haircut: "cut", trim: "cut", colour: "color", colors: "color", hilite: "highlight", foil: "highlight", foils: "highlight", blowdry: "blowout", blow: "blowout", mens: "men", womens: "women", ladies: "women", kids: "child", children: "child", boys: "boy" };

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map((w) => SAME[w] ?? w)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)) // highlights → highlight
    .filter((w) => w !== "dry");
}

/** 0–1: how well a service name answers a query. Exact name 1; all query words present ~0.9; partial overlap lower. */
export function score(query: string, name: string): number {
  const q = words(query);
  const n = words(name);
  if (!q.length || !n.length) return 0;
  if (q.join(" ") === n.join(" ")) return 1;
  const hits = q.filter((w) => n.includes(w)).length;
  if (hits === q.length) return 0.9 - Math.min(0.2, (n.length - q.length) * 0.05);
  return hits / q.length * 0.6;
}

/** Best service for a query at one salon, or null when nothing fits well enough. */
export function bestService<T extends { id: string; name: string; category?: string }>(query: string, services: T[], min = 0.6): T | null {
  let best: T | null = null;
  let top = 0;
  for (const s of services) {
    const v = Math.max(score(query, s.name), s.category ? score(query, s.category) * 0.7 : 0);
    if (v > top) {
      top = v;
      best = s;
    }
  }
  return top >= min ? best : null;
}

/** Each wanted service name → this salon's service id; null if any can't be matched. */
export function matchAll<T extends { id: string; name: string; category?: string }>(wanted: string[], services: T[]): T[] | null {
  const out: T[] = [];
  for (const w of wanted) {
    const m = bestService(w, services.filter((s) => !out.includes(s)));
    if (!m) return null;
    out.push(m);
  }
  return out;
}
