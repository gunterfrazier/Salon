"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import Stars, { RatingSummary } from "@/components/Stars";
import type { ReviewSummary } from "@/lib/reviews/summary";
import { replyToReview, setReviewVisible } from "./actions";

type Row = { id: string; clientId: string | null; rating: number; body: string | null; name: string; services: string | null; status: "published" | "private" | "hidden"; reply: string | null; at: string; staff: string | null };
const BADGE = { published: ["On your page", "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"], private: ["Private feedback", "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100"], hidden: ["Hidden", "bg-background text-muted"] } as const;

export default function ReviewsView({ rows, summary, waiting, slug, tz }: { rows: Row[]; summary: ReviewSummary; waiting: number; slug: string | null; tz: string }) {
  const [filter, setFilter] = useState<"all" | "private">("all");
  const list = rows.filter((r) => filter === "all" || r.status === "private");
  const privateCount = rows.filter((r) => r.status === "private").length;
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <header>
        <h1 className="font-display text-3xl">Reviews</h1>
        <p className="text-sm text-muted">Clients get a rating link after checkout (Settings → Messages). 4–5 stars they agree to share show on your page{slug ? <> (<Link href={`/s/${slug}#reviews`} className="underline">see it</Link>)</> : ""}; lower ratings come only to you.</p>
      </header>
      <section className="rounded-2xl border border-line bg-surface p-4">
        <RatingSummary {...summary} />
        {waiting > 0 && <p className="mt-3 text-xs text-muted">{waiting} client{waiting === 1 ? " hasn't" : "s haven't"} rated their visit yet.</p>}
      </section>
      <div className="flex gap-2 text-sm">
        {(
          [
            ["all", `All · ${rows.length}`],
            ["private", `Private feedback · ${privateCount}`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1.5 ${filter === k ? "border-foreground bg-foreground text-background" : "border-line"}`}>{l}</button>
        ))}
      </div>
      {!list.length && <p className="text-sm text-muted">No reviews yet.</p>}
      {list.map((r) => <ReviewCard key={r.id} r={r} tz={tz} />)}
    </main>
  );
}

function ReviewCard({ r, tz }: { r: Row; tz: string }) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(r.reply ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [label, cls] = BADGE[r.status];
  return (
    <article className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Stars value={r.rating} />
          <span className="font-semibold">{r.clientId ? <Link href={`/app/clients/${r.clientId}`} className="underline">{r.name}</Link> : r.name}</span>
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
      </div>
      <p className="text-xs text-muted">
        {new Date(r.at).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" })}
        {r.services ? ` · ${r.services}` : ""}
        {r.staff ? ` · ${r.staff}` : ""}
      </p>
      {r.body && <p className="whitespace-pre-wrap">{r.body}</p>}
      {r.reply && !replying && (
        <div className="rounded-xl bg-background p-3 text-sm">
          <p className="text-xs font-semibold text-muted">Your reply</p>
          <p className="whitespace-pre-wrap">{r.reply}</p>
        </div>
      )}
      {replying && (
        <div className="space-y-2">
          <textarea className="w-full rounded-xl border border-line bg-background px-3 py-2 text-base" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Thank you so much! See you next time." />
          <div className="flex gap-2">
            <button className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50" disabled={pending} onClick={() => start(async () => { const x = await replyToReview(r.id, reply); if (x.ok) setReplying(false); else setErr(x.error); })}>Save reply</button>
            <button className="rounded-full border border-line px-4 py-2 text-sm" onClick={() => setReplying(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        {!replying && r.status !== "private" && <button className="rounded-full border border-line px-3 py-1.5" onClick={() => setReplying(true)}>{r.reply ? "Edit reply" : "Reply"}</button>}
        {r.status === "published" && <button className="rounded-full border border-line px-3 py-1.5" disabled={pending} onClick={() => start(async () => { const x = await setReviewVisible(r.id, false); if (!x.ok) setErr(x.error); })}>Hide from page</button>}
        {r.status === "hidden" && <button className="rounded-full border border-line px-3 py-1.5" disabled={pending} onClick={() => start(async () => { const x = await setReviewVisible(r.id, true); if (!x.ok) setErr(x.error); })}>Show on page</button>}
        {r.status === "private" && r.clientId && <Link href={`/app/clients/${r.clientId}`} className="rounded-full border border-line px-3 py-1.5">Reach out</Link>}
      </div>
      {err && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{err}</p>}
    </article>
  );
}
