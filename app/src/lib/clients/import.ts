/**
 * Client import from a CSV export (StyleSeat or any spreadsheet).
 * Runs in the browser for the preview; the server re-validates.
 */

/** RFC 4180 CSV: quoted fields, "" escapes, commas/newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportField = "firstName" | "lastName" | "fullName" | "phone" | "email" | "notes" | "visits";

export const FIELD_LABELS: Record<ImportField, string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name",
  phone: "Phone",
  email: "Email",
  notes: "Notes",
  visits: "Number of visits",
};

const GUESSES: [ImportField, RegExp][] = [
  ["firstName", /^(first|given)[ _-]?name$|^first$/i],
  ["lastName", /^(last|family|sur)[ _-]?name$|^last$/i],
  ["fullName", /^(client|customer)?[ _-]?(full[ _-]?)?name$|^client$/i],
  ["email", /e-?mail/i],
  ["phone", /phone|mobile|cell|tel/i],
  ["notes", /note|comment/i],
  ["visits", /visits|appointments|bookings|total.*(appt|appointment|visit)/i],
];

/** Guess which column holds each field from the header row. */
export function guessMapping(headers: string[]): Partial<Record<ImportField, number>> {
  const map: Partial<Record<ImportField, number>> = {};
  headers.forEach((h, i) => {
    const name = h.trim();
    for (const [field, re] of GUESSES) {
      if (map[field] === undefined && re.test(name)) {
        map[field] = i;
        break;
      }
    }
  });
  // A dedicated first-name column wins over a full-name column.
  if (map.firstName !== undefined) delete map.fullName;
  return map;
}

/** Last 10 digits for US numbers; used to spot duplicates. */
export const phoneKey = (p: string | null | undefined) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d.length >= 7 ? d : "";
};

export function formatPhone(p: string): string | null {
  const d = p.replace(/\D/g, "");
  if (!d) return null;
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : p.trim();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ImportRow {
  line: number; // 1-based row in the file (header = 1)
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  priorVisits: number;
  status: "new" | "duplicate" | "invalid";
  reason?: string;
}

export interface ExistingClient {
  phone: string | null;
  email: string | null;
}

/**
 * Turn CSV rows into clients to import. Duplicates (same phone or email as an
 * existing client, or earlier in the file) are skipped. Clients with no
 * visit count are treated as returning (1 prior visit) when markReturning.
 */
export function prepareImport(
  rows: string[][],
  map: Partial<Record<ImportField, number>>,
  existing: ExistingClient[],
  opts: { hasHeader: boolean; markReturning: boolean },
): ImportRow[] {
  const seenPhones = new Set(existing.map((c) => phoneKey(c.phone)).filter(Boolean));
  const seenEmails = new Set(existing.map((c) => (c.email ?? "").toLowerCase()).filter(Boolean));
  const body = opts.hasHeader ? rows.slice(1) : rows;
  const get = (r: string[], f: ImportField) => (map[f] !== undefined ? (r[map[f]!] ?? "").trim() : "");

  return body.map((r, i) => {
    let first = get(r, "firstName");
    let last = get(r, "lastName");
    if (!first && get(r, "fullName")) {
      const parts = get(r, "fullName").split(/\s+/);
      first = parts.shift() ?? "";
      last = last || parts.join(" ");
    }
    const emailRaw = get(r, "email").toLowerCase();
    const phoneRaw = get(r, "phone");
    const visitsRaw = get(r, "visits").replace(/[^\d]/g, "");
    const visits = visitsRaw ? Number(visitsRaw) : opts.markReturning ? 1 : 0;
    const out: ImportRow = {
      line: i + (opts.hasHeader ? 2 : 1),
      firstName: first,
      lastName: last || null,
      phone: phoneRaw ? formatPhone(phoneRaw) : null,
      email: emailRaw && EMAIL.test(emailRaw) ? emailRaw : null,
      notes: get(r, "notes") || null,
      priorVisits: Math.min(visits, 9999),
      status: "new",
    };
    if (!first) return { ...out, status: "invalid", reason: "No name" };
    if (emailRaw && !out.email && !out.phone) return { ...out, status: "invalid", reason: "Email looks wrong and no phone" };
    const pk = phoneKey(out.phone);
    if ((pk && seenPhones.has(pk)) || (out.email && seenEmails.has(out.email))) return { ...out, status: "duplicate", reason: "Already a client" };
    if (pk) seenPhones.add(pk);
    if (out.email) seenEmails.add(out.email);
    return out;
  });
}
