"use client";

import { blockRange, TIME_BLOCKS, WEEKS_OUT, type SearchCriteria, type TimeBlock } from "@/lib/booking/search";
import { parseHHMM, toHHMM } from "@/lib/time/zone";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`;

/** Days of the week, time block, and where to start looking. */
export default function SearchControls({
  criteria, onChange, openDays, zone,
}: {
  criteria: SearchCriteria;
  onChange: (c: SearchCriteria) => void;
  /** Weekdays the salon is open (others shown disabled). */
  openDays?: number[];
  /** e.g. "CST", shown with custom times. */
  zone?: string;
}) {
  const custom = typeof criteria.block === "object";
  const [from, to] = blockRange(criteria.block);
  const setBlock = (block: TimeBlock) => onChange({ ...criteria, block });

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Days</legend>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={criteria.weekdays.length === 0} className={chip(criteria.weekdays.length === 0)} onClick={() => onChange({ ...criteria, weekdays: [] })}>
            Any day
          </button>
          {DAYS.map((d, i) => {
            const on = criteria.weekdays.includes(i);
            const closed = openDays && !openDays.includes(i);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                disabled={closed}
                title={closed ? "Closed this day" : undefined}
                className={`${chip(on)} disabled:opacity-35`}
                onClick={() => onChange({ ...criteria, weekdays: on ? criteria.weekdays.filter((x) => x !== i) : [...criteria.weekdays, i].sort() })}
              >
                {d}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Time of day</legend>
        <div className="flex flex-wrap gap-1.5">
          {TIME_BLOCKS.map((t) => (
            <button key={t.key} type="button" aria-pressed={criteria.block === t.key} className={chip(criteria.block === t.key)} onClick={() => setBlock(t.key)}>
              {t.label}
            </button>
          ))}
          <button type="button" aria-pressed={custom} className={chip(custom)} onClick={() => setBlock({ from: 9 * 60, to: 13 * 60 })}>
            Between…
          </button>
        </div>
        {custom && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <input type="time" step={900} value={toHHMM(from)} onChange={(e) => e.target.value && setBlock({ from: parseHHMM(e.target.value), to })} className="rounded-lg border border-line bg-background px-2 py-1.5" aria-label="Start after" />
            <span>and</span>
            <input type="time" step={900} value={toHHMM(Math.min(to, 1439))} onChange={(e) => e.target.value && setBlock({ from, to: parseHHMM(e.target.value) })} className="rounded-lg border border-line bg-background px-2 py-1.5" aria-label="Start before" />
            {zone && <span className="text-muted">{zone}</span>}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">When</legend>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={criteria.start.kind === "next"} className={chip(criteria.start.kind === "next")} onClick={() => onChange({ ...criteria, start: { kind: "next" } })}>
            Next available
          </button>
          {WEEKS_OUT.map((w) => {
            const on = criteria.start.kind === "weeks" && criteria.start.weeks === w;
            return (
              <button key={w} type="button" aria-pressed={on} className={chip(on)} onClick={() => onChange({ ...criteria, start: { kind: "weeks", weeks: w } })}>
                {w} weeks
              </button>
            );
          })}
          <label className={`${chip(criteria.start.kind === "date")} flex items-center gap-1`}>
            From
            <input
              type="date"
              value={criteria.start.kind === "date" ? criteria.start.date : ""}
              onChange={(e) => e.target.value && onChange({ ...criteria, start: { kind: "date", date: e.target.value } })}
              className="bg-transparent text-sm"
              aria-label="Search from date"
            />
          </label>
        </div>
      </fieldset>
    </div>
  );
}
