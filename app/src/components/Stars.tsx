/** Read-only star rating (with a text label for screen readers). */
export default function Stars({ value, className = "size-4" }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" className={`${className} ${n <= Math.round(value) ? "text-amber-500" : "text-line"}`} fill="currentColor" aria-hidden="true">
          <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />
        </svg>
      ))}
    </span>
  );
}

/** Average with a bar per star level, like app-store ratings. */
export function RatingSummary({ average, count, histogram }: { average: number | null; count: number; histogram: number[] }) {
  const max = Math.max(1, ...histogram);
  return (
    <div className="flex items-center gap-5">
      <div className="text-center">
        <p className="font-display text-5xl leading-none">{average ?? "–"}</p>
        <Stars value={average ?? 0} />
        <p className="mt-1 text-xs text-muted">{count} review{count === 1 ? "" : "s"}</p>
      </div>
      <div className="min-w-0 flex-1 space-y-1" aria-hidden="true">
        {[5, 4, 3, 2, 1].map((n) => (
          <div key={n} className="flex items-center gap-2 text-xs text-muted">
            <span className="w-2">{n}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-amber-500" style={{ width: `${(histogram[n - 1] / max) * 100}%` }} />
            </span>
            <span className="w-6 text-right">{histogram[n - 1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
