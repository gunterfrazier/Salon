/** "Chair Wrapped": a salon's year in numbers, for a shareable recap. */

export interface WrappedVisit {
  clientId: string;
  start: string;
  minutes: number;
  services: string[];
}

export interface Wrapped {
  year: number;
  visits: number;
  clients: number;
  newClients: number;
  /** Hours in the chair, rounded. */
  hours: number;
  topService: string | null;
  /** Busiest month name. */
  busiestMonth: string | null;
  fiveStar: number;
  /** Clients who came 3+ times. */
  regulars: number;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * visits: completed visits in the year (salon time already applied to `start` as YYYY-MM-DD…).
 * firstVisitBefore: clients seen before this year (so they aren't counted as new).
 */
export function buildWrapped(year: number, visits: WrappedVisit[], seenBefore: Set<string>, fiveStar: number): Wrapped {
  const byClient = new Map<string, number>();
  const bySvc = new Map<string, number>();
  const byMonth = new Array(12).fill(0) as number[];
  let minutes = 0;
  for (const v of visits) {
    byClient.set(v.clientId, (byClient.get(v.clientId) ?? 0) + 1);
    for (const s of v.services) bySvc.set(s, (bySvc.get(s) ?? 0) + 1);
    const m = Number(v.start.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) byMonth[m]++;
    minutes += v.minutes;
  }
  const top = [...bySvc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const busiest = byMonth.indexOf(Math.max(...byMonth));
  return {
    year,
    visits: visits.length,
    clients: byClient.size,
    newClients: [...byClient.keys()].filter((c) => !seenBefore.has(c)).length,
    hours: Math.round(minutes / 60),
    topService: top ? top[0] : null,
    busiestMonth: visits.length ? MONTHS[busiest] : null,
    fiveStar,
    regulars: [...byClient.values()].filter((n) => n >= 3).length,
  };
}
