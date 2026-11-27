"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { waterRipple } from "@/components/ripple";
import { submitReview } from "./actions";

const WORDS = ["", "Not good", "Could be better", "Okay", "Great", "Loved it"];

export default function RateVisit({ token, salonSlug, stylist }: { token: string; salonSlug: string | null; stylist: string | null }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [share, setShare] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ published: boolean; google: string | null } | null>(null);
  const [pending, start] = useTransition();
  const shown = hover || rating;

  if (done) {
    return (
      <section className="mt-8 rounded-2xl border border-line bg-surface p-6" role="status">
        <p className="font-display text-3xl">Thank you!</p>
        {rating >= 4 ? (
          <p className="mt-2 text-muted">{stylist ? `${stylist} will love hearing this.` : "The salon will love hearing this."}{done.published ? " Your review is on the salon's page." : ""}</p>
        ) : (
          <p className="mt-2 text-muted">Your feedback went privately to the salon, and they may reach out to make it right.</p>
        )}
        {done.google && (
          <a href={done.google} target="_blank" rel="noreferrer" className="mt-5 inline-block rounded-full bg-foreground px-6 py-3 font-semibold text-background">
            Also share it on Google
          </a>
        )}
        {salonSlug && (
          <p className="mt-4">
            <Link href={`/s/${salonSlug}/book`} className="underline">Book your next visit</Link>
          </p>
        )}
      </section>
    );
  }

  return (
    <div className="mt-8 space-y-5 text-left">
      <div className="flex justify-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}: ${WORDS[n]}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            className="p-1 transition active:scale-90"
          >
            <svg viewBox="0 0 24 24" className={`size-11 ${n <= shown ? "text-amber-500" : "text-line"}`} fill="currentColor" aria-hidden="true">
              <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />
            </svg>
          </button>
        ))}
      </div>
      <p className="h-6 text-center font-display text-xl" aria-live="polite">{WORDS[shown]}</p>
      {rating > 0 && (
        <>
          <label className="block text-sm font-medium">
            {rating >= 4 ? "What did you love? (optional)" : "What could we do better? (optional)"}
            <textarea className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1500} />
          </label>
          {rating >= 4 && (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 size-5" checked={share} onChange={(e) => setShare(e.target.checked)} />
              <span>Show my review on the salon&rsquo;s page (first name and last initial only)</span>
            </label>
          )}
          {rating < 4 && <p className="text-sm text-muted">This goes only to the salon, not their public page.</p>}
          {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
          <button
            disabled={pending}
            onClick={(e) => {
              waterRipple(e.currentTarget, e);
              start(async () => {
                const r = await submitReview(token, rating, body, share).catch(() => ({ ok: false as const, error: "Couldn't send. Please try again." }));
                if (r.ok) setDone({ published: r.published, google: r.google });
                else setError(r.error);
              });
            }}
            className="relative w-full overflow-hidden rounded-full bg-foreground py-3.5 font-semibold text-background disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </>
      )}
    </div>
  );
}
