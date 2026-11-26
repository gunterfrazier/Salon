"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";

export interface Bucket {
  label: string;
  /** Full label for the tooltip/table, e.g. "Tue, Dec 1" or "Week of Nov 29". */
  long: string;
  collected: number;
  visits: number;
}

/**
 * Money received per day/week/month: one series, single blue, columns <= 24px
 * with a rounded top, hover/focus tooltip, and a table view.
 */
export default function RevenueChart({ buckets, unit }: { buckets: Bucket[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(160, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);
  const max = Math.max(1, ...buckets.map((b) => b.collected));
  const nice = niceMax(max);
  const H = 180;
  // Fit the container: columns share the width, capped at 24px thick with air between.
  const step = width / Math.max(1, buckets.length);
  const bar = Math.min(24, Math.max(2, step * 0.7));
  const W = width;
  const labelEvery = Math.ceil(buckets.length / Math.max(2, Math.floor(width / 36)));
  const total = buckets.reduce((n, b) => n + b.collected, 0);

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Money received by {unit}</h2>
        <button type="button" className="text-sm underline" onClick={() => setTable(!table)}>
          {table ? "Show chart" : "Show table"}
        </button>
      </div>
      {table ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-medium">{unit[0].toUpperCase() + unit.slice(1)}</th>
              <th className="py-1 text-right font-medium">Received</th>
              <th className="py-1 text-right font-medium">Visits</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.long} className="border-t border-line">
                <td className="py-1">{b.long}</td>
                <td className="py-1 text-right tabular-nums">{money(b.collected)}</td>
                <td className="py-1 text-right tabular-nums">{b.visits}</td>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold">
              <td className="py-1">Total</td>
              <td className="py-1 text-right tabular-nums">{money(total)}</td>
              <td className="py-1 text-right tabular-nums">{buckets.reduce((n, b) => n + b.visits, 0)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div className="relative mt-3">
          <div className="flex">
            <div className="flex w-12 shrink-0 flex-col justify-between pb-5 text-right text-[11px] text-muted" style={{ height: H + 20 }}>
              <span>{money(nice)}</span>
              <span>{money(nice / 2)}</span>
              <span>$0</span>
            </div>
            <div ref={box} className="min-w-0 flex-1">
              <svg width={W} height={H + 20} role="img" aria-label={`Money received by ${unit}, total ${money(total)}`} className="block">
                {[0, 0.5, 1].map((f) => (
                  <line key={f} x1={0} x2={W} y1={H - f * H + 0.5} y2={H - f * H + 0.5} className="stroke-line" strokeWidth={1} />
                ))}
                {buckets.map((b, i) => {
                  const h = (b.collected / nice) * H;
                  const x = i * step + (step - bar) / 2;
                  const r = Math.min(4, h / 2, bar / 2);
                  return (
                    <g key={b.long}>
                      {h > 0 && (
                        <path
                          d={`M${x},${H} V${H - h + r} Q${x},${H - h} ${x + r},${H - h} H${x + bar - r} Q${x + bar},${H - h} ${x + bar},${H - h + r} V${H} Z`}
                          className="chart-bar"
                          opacity={hover === null || hover === i ? 1 : 0.45}
                        />
                      )}
                      {/* Hit target: the whole column slot, taller than the bar. */}
                      <rect
                        x={i * step}
                        y={0}
                        width={step}
                        height={H}
                        fill="transparent"
                        tabIndex={0}
                        aria-label={`${b.long}: ${money(b.collected)}, ${b.visits} visits`}
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(i)}
                        onBlur={() => setHover(null)}
                        onClick={() => setHover(i)}
                      />
                      {i % labelEvery === 0 && (
                        <text x={i * step + step / 2} y={H + 14} textAnchor="middle" className="fill-muted text-[10px]">
                          {b.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
          {hover !== null && (
            <div role="status" className="pointer-events-none absolute top-0 right-0 rounded-lg border border-line bg-background px-3 py-2 text-sm shadow">
              <p className="font-semibold">{buckets[hover].long}</p>
              <p className="tabular-nums">{money(buckets[hover].collected)} received</p>
              <p className="text-muted tabular-nums">{buckets[hover].visits} visit{buckets[hover].visits === 1 ? "" : "s"}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function niceMax(v: number): number {
  const dollars = v / 100;
  const pow = 10 ** Math.floor(Math.log10(Math.max(dollars, 1)));
  const n = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((m) => m >= dollars) ?? 10 * pow;
  return Math.max(n, 1) * 100;
}
