/** The salon display (TV / smart board): who's in the chair today, privacy-safe. */

export interface BoardAppt {
  id: string;
  staffId: string;
  clientName: string;
  start: string;
  end: string;
  status: string;
  services: string[];
}

export type BoardState = "done" | "now" | "here" | "next" | "later";

export interface BoardRow {
  id: string;
  start: string;
  end: string;
  /** "Jamie R." */
  name: string;
  services: string;
  state: BoardState;
}

export interface BoardColumn {
  staffId: string;
  stylist: string;
  rows: BoardRow[];
}

/** First name and last initial only: a shared screen never shows a full name. */
export function publicName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Guest";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

const SHOWN = new Set(["pending", "booked", "confirmed", "checked_in", "in_service", "completed"]);

/** One column per stylist (those with appointments, in order), each visit with its state right now. */
export function buildBoard(appts: BoardAppt[], stylists: { id: string; name: string }[], now: Date): BoardColumn[] {
  const t = now.getTime();
  const cols: BoardColumn[] = [];
  for (const s of stylists) {
    const mine = appts.filter((a) => a.staffId === s.id && SHOWN.has(a.status)).sort((a, b) => a.start.localeCompare(b.start));
    if (!mine.length) continue;
    let nextMarked = false;
    const rows = mine.map((a) => {
      const st = Date.parse(a.start);
      const en = Date.parse(a.end);
      let state: BoardState;
      if (a.status === "completed" || en <= t) state = "done";
      else if (a.status === "in_service" || (st <= t && t < en)) state = "now";
      else if (a.status === "checked_in") state = "here";
      else if (!nextMarked) {
        state = "next";
        nextMarked = true;
      } else state = "later";
      return { id: a.id, start: a.start, end: a.end, name: publicName(a.clientName), services: a.services.join(" + "), state };
    });
    cols.push({ staffId: s.id, stylist: s.name.split(" ")[0], rows });
  }
  return cols;
}

/** Text for a rotating slide from a review, kept short for a TV. */
export function reviewSnippet(body: string, max = 140): string {
  const t = body.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trim()}…`;
}
