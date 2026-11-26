"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { FIELD_LABELS, guessMapping, parseCsv, prepareImport, type ExistingClient, type ImportField } from "@/lib/clients/import";
import { fullName } from "@/lib/format";
import { importClients } from "../actions";

const FIELDS = Object.keys(FIELD_LABELS) as ImportField[];
const STATUS_STYLE = {
  new: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  duplicate: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  invalid: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export default function ImportClients({ existing }: { existing: ExistingClient[] }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Partial<Record<ImportField, number>>>({});
  const [markReturning, setMarkReturning] = useState(true);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  async function onFile(f: File | undefined) {
    setResult(null);
    setError(null);
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return setError("That file is larger than 5 MB.");
    const parsed = parseCsv(await f.text());
    if (parsed.length < 2) return setError("That file has no client rows.");
    setFileName(f.name);
    setRows(parsed);
    setMap(guessMapping(parsed[0]));
  }

  const prepared = useMemo(() => (rows ? prepareImport(rows, map, existing, { hasHeader: true, markReturning }) : []), [rows, map, existing, markReturning]);
  const counts = { new: 0, duplicate: 0, invalid: 0 };
  prepared.forEach((r) => counts[r.status]++);
  const headers = rows?.[0] ?? [];
  const hasName = map.firstName !== undefined || map.fullName !== undefined;

  function run() {
    start(async () => {
      const r = await importClients(prepared.filter((x) => x.status === "new").map(({ firstName, lastName, phone, email, notes, priorVisits }) => ({ firstName, lastName, phone, email, notes, priorVisits })));
      if (r.ok) {
        setResult({ imported: r.imported, skipped: r.skipped });
        setRows(null);
      } else setError(r.error);
    });
  }

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div>
        <Link href="/app/clients" className="text-sm text-muted hover:underline">‹ Clients</Link>
        <h1 className="mt-1 text-2xl font-bold">Import clients</h1>
        <p className="text-sm text-muted">
          From StyleSeat: Clients → menu → <strong>Export Client List</strong>. StyleSeat emails you a CSV file. Choose it below. Any spreadsheet saved as CSV works too.
        </p>
      </div>

      {result && (
        <div className="rounded-xl border-2 border-emerald-600 bg-surface p-4" role="status">
          <p className="font-semibold">Imported {result.imported} clients.</p>
          {result.skipped > 0 && <p className="text-sm text-muted">{result.skipped} skipped (duplicates or missing names).</p>}
          <Link href="/app/clients" className="mt-2 inline-block underline">View clients</Link>
        </div>
      )}

      <label className="block rounded-xl border-2 border-dashed border-line bg-surface p-6 text-center">
        <span className="font-semibold">{fileName ?? "Choose a CSV file"}</span>
        <input type="file" accept=".csv,text/csv" className="mt-2 block w-full text-sm" onChange={(e) => onFile(e.target.files?.[0])} aria-label="CSV file" />
      </label>
      {error && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}

      {rows && (
        <>
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-semibold">Match the columns</h2>
            <p className="text-sm text-muted">We guessed from the column names. Fix any that are wrong.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f} className="flex items-center justify-between gap-2 text-sm">
                  <span>{FIELD_LABELS[f]}</span>
                  <select
                    value={map[f] ?? ""}
                    onChange={(e) => setMap({ ...map, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className="w-1/2 rounded-lg border border-line bg-background px-2 py-1.5"
                    aria-label={`${FIELD_LABELS[f]} column`}
                  >
                    <option value="">(not in file)</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={markReturning} onChange={(e) => setMarkReturning(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
              <span>
                <span className="font-semibold">These are returning clients</span>
                <span className="block text-muted">So they aren&rsquo;t asked for a new-client deposit. Uses the visits column if there is one, otherwise counts 1 past visit.</span>
              </span>
            </label>
          </section>

          <section className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
              <p className="text-sm">
                <strong>{counts.new}</strong> to import · {counts.duplicate} already clients · {counts.invalid} can&rsquo;t import
              </p>
              <button onClick={run} disabled={!hasName || counts.new === 0 || saving} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-40">
                {saving ? "Importing…" : `Import ${counts.new} clients`}
              </button>
            </div>
            {!hasName && <p className="p-4 text-sm text-red-700 dark:text-red-300">Pick which column has the first name (or full name).</p>}
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto text-sm">
              {prepared.slice(0, 500).map((r) => (
                <li key={r.line} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0">
                    <span className="font-semibold">{r.firstName ? fullName(r.firstName, r.lastName) : <em className="text-muted">no name</em>}</span>
                    <span className="block text-muted">{[r.phone, r.email, r.priorVisits ? `${r.priorVisits} visit${r.priorVisits === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                    {r.status === "new" ? "Import" : r.reason}
                  </span>
                </li>
              ))}
              {prepared.length > 500 && <li className="px-4 py-2 text-muted">…and {prepared.length - 500} more</li>}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
