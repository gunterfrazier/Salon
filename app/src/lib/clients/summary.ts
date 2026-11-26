import type { Standing } from "../policy/flags";

/** One row on the Clients page (JSON-safe). */
export interface ClientSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  lastVisit: string | null; // ISO, last completed visit
  nextVisit: string | null; // ISO, next open appointment
  visits: number; // completed here + imported
  balance: number; // cents owed
  standing: Standing;
  activeFlag: "no_show" | "late_cancel" | null;
}

export type ClientFilter = "all" | "flagged" | "owes" | "lapsed" | "new";

export const FILTERS: { key: ClientFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "flagged", label: "Flagged" },
  { key: "owes", label: "Owes money" },
  { key: "lapsed", label: "Not seen 8+ weeks" },
  { key: "new", label: "New" },
];

const LAPSED_DAYS = 56;

export function matchesQuery(c: ClientSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").toLowerCase();
  const digits = q.replace(/\D/g, "");
  return (
    name.includes(q) ||
    (c.email ?? "").toLowerCase().includes(q) ||
    (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits))
  );
}

export function matchesFilter(c: ClientSummary, f: ClientFilter, now: Date): boolean {
  switch (f) {
    case "all":
      return true;
    case "flagged":
      return c.standing === "active" || c.standing === "permanent";
    case "owes":
      return c.balance > 0;
    case "new":
      return c.visits === 0;
    case "lapsed":
      return !c.nextVisit && !!c.lastVisit && now.getTime() - new Date(c.lastVisit).getTime() >= LAPSED_DAYS * 86_400_000;
  }
}

export function filterClients(list: ClientSummary[], query: string, f: ClientFilter, now: Date): ClientSummary[] {
  return list
    .filter((c) => matchesQuery(c, query) && matchesFilter(c, f, now))
    .sort((a, b) => `${a.firstName} ${a.lastName ?? ""}`.localeCompare(`${b.firstName} ${b.lastName ?? ""}`, "en", { sensitivity: "base" }));
}
