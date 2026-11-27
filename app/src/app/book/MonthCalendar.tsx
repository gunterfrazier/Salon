"use client";

import { useState } from "react";
import { addDays, weekday } from "@/lib/time/zone";

const W = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** How open a day is: dots like a booking app, never color alone (the label says it too). */
export function openness(n: number | undefined): { label: string; cls: string } | null {
  if (n === undefined) return null;
  if (n <= 0) return { label: "full", cls: "" };
  if (n <= 3) return { label: "a few times", cls: "bg-amber-500" };
  if (n <= 9) return { label: "some times", cls: "bg-sky-500 dark:bg-water" };
  return { label: "lots of times", cls: "bg-emerald-600 dark:bg-emerald-400" };
}

/** A month at a time; only bookable days can be picked. counts = open start times per day (when known). */
export default function MonthCalendar({ dates, counts, selected, onPick }: { dates: string[]; counts: Record<string, number> | null; selected: string | null; onPick: (d: string) => void }) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const [month, setMonth] = useState((selected ?? first ?? "").slice(0, 7));
  if (!first) return <p className="text-sm text-muted">No days are open for online booking right now.</p>;
  const open = new Set(dates);
  const start = `${month}-01`;
  const lead = weekday(start);
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = start; d.slice(0, 7) === month; d = addDays(d, 1)) cells.push(d);
  const label = new Date(`${start}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-display text-xl">{label}</p>
        <div className="flex gap-1">
          <button type="button" className="size-9 rounded-full border border-line disabled:opacity-30" aria-label="Previous month" disabled={month <= first.slice(0, 7)} onClick={() => shift(-1)}>‹</button>
          <button type="button" className="size-9 rounded-full border border-line disabled:opacity-30" aria-label="Next month" disabled={month >= last.slice(0, 7)} onClick={() => shift(1)}>›</button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center" role="grid" aria-label={label}>
        {W.map((w) => <div key={w} className="py-1 text-xs text-muted" role="columnheader">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} />;
          const n = counts?.[d];
          const o = openness(n);
          const can = open.has(d) && (n === undefined || n > 0);
          const on = selected === d;
          const day = Number(d.slice(8));
          return (
            <button
              key={d}
              type="button"
              disabled={!can}
              onClick={() => onPick(d)}
              aria-pressed={on}
              aria-label={`${new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })}${!open.has(d) ? ", closed" : o ? `, ${o.label}` : ""}`}
              className={`flex aspect-square flex-col items-center justify-center rounded-full text-sm ${on ? "bg-foreground font-semibold text-background" : can ? "hover:bg-background" : "text-muted/50 line-through decoration-1"}`}
            >
              {day}
              <span className={`mt-0.5 h-1 w-1 rounded-full ${o && can && !on ? o.cls : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>
      {counts && (
        <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted" aria-hidden="true">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" /> lots open</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-water" /> some</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> a few</span>
        </p>
      )}
    </div>
  );
}
