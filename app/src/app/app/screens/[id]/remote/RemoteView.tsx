"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { playPosition, type Control, type Source } from "@/lib/screens/playback";
import { formatTime } from "@/lib/time/zone";
import { remoteCommand, remoteOverride } from "../../actions";

const WHY: Record<Source["why"], string> = { own: "its own playlist", schedule: "the schedule", closed: "because the salon is closed", override: "you chose it" };

export default function RemoteView({ id, name, source, slides, control, serverNow, others, tz }: { id: string; name: string; source: Source & { name: string }; slides: { id: string; label: string; seconds: number }[]; control: Control; serverNow: number; others: { id: string; name: string }[]; tz: string }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [pick, setPick] = useState(others[0]?.id ?? "");
  const [howLong, setHowLong] = useState<"hour" | "today" | "until">("hour");
  const [pending, start] = useTransition();

  useEffect(() => {
    const first = setTimeout(() => {
      setOffset(serverNow - Date.now());
      setNow(Date.now());
    }, 0);
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [serverNow]);

  const pos = now !== null && slides.length ? playPosition(slides.map((s) => s.seconds), now + offset, control) : null;
  const paused = !!control.pausedAt;
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? null : r.error);
      router.refresh();
    });
  const big = "flex-1 rounded-2xl border border-line bg-surface px-4 py-5 text-xl font-semibold disabled:opacity-40";

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-4">
      <header>
        <Link href={`/app/screens/${id}`} className="text-sm text-muted">‹ {name}</Link>
        <h1 className="font-display text-3xl">Remote</h1>
        <p className="text-sm text-muted">
          Playing <strong className="text-foreground">{source.name}</strong> ({WHY[source.why]}
          {source.why === "override" && source.until ? `, until ${formatTime(new Date(source.until), tz)}` : ""}). Every TV on this screen follows.
        </p>
      </header>

      {slides.length ? (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">{paused ? "Paused on" : "Now"}</p>
          <p className="text-2xl font-semibold">{pos ? slides[pos.index].label : "…"}</p>
          {pos && !paused && <p className="text-sm text-muted">{Math.ceil(pos.remaining)} s · then {slides[(pos.index + 1) % slides.length].label}</p>}
        </section>
      ) : (
        <p className="text-sm text-muted">This playlist is empty.</p>
      )}

      <div className="flex gap-2">
        <button className={big} disabled={pending || !slides.length} onClick={() => run(() => remoteCommand(id, "back"))} aria-label="Back">‹ Back</button>
        <button className={big} disabled={pending || !slides.length} onClick={() => run(() => remoteCommand(id, paused ? "play" : "pause"))}>{paused ? "▶ Play" : "❚❚ Pause"}</button>
        <button className={big} disabled={pending || !slides.length} onClick={() => run(() => remoteCommand(id, "next"))} aria-label="Next">Next ›</button>
      </div>

      {slides.length > 1 && (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {slides.map((s, i) => (
            <li key={s.id}>
              <button className={`flex w-full justify-between px-4 py-3 text-left ${pos?.index === i ? "font-semibold" : ""}`} disabled={pending} onClick={() => run(() => remoteCommand(id, "jump", i))}>
                <span>{s.label}</span>
                <span className="text-sm text-muted">{pos?.index === i ? "showing" : `${s.seconds} s`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Play something else</h2>
        {others.length ? (
          <>
            <select className="w-full rounded-xl border border-line bg-background px-3 py-2" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Screen to play">
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div className="flex flex-wrap gap-2 text-sm">
              {([["hour", "For an hour"], ["today", "Rest of today"], ["until", "Until I change it back"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={howLong === k} onClick={() => setHowLong(k)} className={`rounded-full border px-3 py-1.5 ${howLong === k ? "border-accent bg-accent text-on-accent" : "border-line"}`}>{l}</button>
              ))}
            </div>
            <button className="w-full rounded-full bg-accent px-4 py-3 font-semibold text-on-accent disabled:opacity-40" disabled={pending || !pick} onClick={() => run(() => remoteOverride(id, pick, howLong))}>Play it</button>
          </>
        ) : (
          <p className="text-sm text-muted">Make another screen first; its playlist can then be played here.</p>
        )}
        {source.why === "override" && (
          <button className="w-full rounded-full border border-line px-4 py-3 font-semibold" disabled={pending} onClick={() => run(() => remoteOverride(id, null, "hour"))}>Back to the schedule</button>
        )}
      </section>
      {msg && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{msg}</p>}
    </main>
  );
}
