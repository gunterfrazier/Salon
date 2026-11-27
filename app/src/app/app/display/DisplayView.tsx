"use client";

/* eslint-disable @next/next/no-img-element -- salon logo */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "@/components/QRCode";
import type { BoardColumn, BoardState } from "@/lib/display/board";
import { formatDay, formatTime } from "@/lib/time/zone";

type Props = {
  salon: string;
  logoUrl: string | null;
  tz: string;
  date: string;
  today: string;
  prev: string;
  next: string;
  closedLabel: string | null;
  board: BoardColumn[];
  openings: { stylist: string; start: string; minutes: number }[];
  specials: { code: string; text: string; until: string | null }[];
  reviews: { text: string; name: string }[];
  bookUrl: string;
  touch: boolean;
};

const STATE: Record<BoardState, [string, string]> = {
  done: ["Done", "opacity-40"],
  now: ["In the chair", "bg-accent text-on-accent"],
  here: ["Checked in", "border-accent"],
  next: ["Next", "border-[#f5efe6]/40"],
  later: ["", ""],
};

/** Full-screen display: today's chairs, specials, reviews and a booking QR. Refreshes itself. */
export default function DisplayView(p: Props) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [slide, setSlide] = useState(0);

  // Clock (client only, so the server and browser never disagree), data refresh every minute, slides every 12 s.
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const c = setInterval(tick, 1000);
    const r = setInterval(() => router.refresh(), 60_000);
    const s = setInterval(() => setSlide((x) => x + 1), 12_000);
    return () => {
      clearInterval(c);
      clearInterval(r);
      clearInterval(s);
    };
  }, [router]);

  const slides = [
    { key: "book", node: <BookSlide url={p.bookUrl} /> },
    ...(p.openings.length ? [{ key: "open", node: <OpenSlide openings={p.openings} tz={p.tz} /> }] : []),
    ...p.specials.map((s) => ({ key: `s-${s.code}`, node: <SpecialSlide {...s} /> })),
    ...p.reviews.map((r, i) => ({ key: `r-${i}`, node: <ReviewSlide {...r} /> })),
  ];
  const current = slides[slide % slides.length];
  const qs = (d: string) => `?date=${d}${p.touch ? "&touch=1" : ""}`;

  return (
    <div className="brand-dark flex min-h-dvh flex-col gap-6 p-6 lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {p.logoUrl ? <img src={p.logoUrl} alt="" className="size-14 rounded-xl object-cover" /> : <img src="/brand/mark-ivory.png" alt="" className="h-12 w-auto" />}
          <div>
            <p className="font-display text-4xl leading-none">{p.salon}</p>
            <p className="mt-1 text-lg text-muted">{formatDay(p.date, { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {p.touch && (
            <>
              <Link href={qs(p.prev)} className="rounded-full border border-line px-5 py-3 text-lg">‹</Link>
              {p.date !== p.today && <Link href={qs(p.today)} className="rounded-full border border-line px-5 py-3 text-lg">Today</Link>}
              <Link href={qs(p.next)} className="rounded-full border border-line px-5 py-3 text-lg">›</Link>
              <Link href="/app/kiosk" className="rounded-full bg-accent px-6 py-3 text-lg font-semibold text-on-accent">Check in</Link>
            </>
          )}
          <p className="font-mono text-5xl tabular-nums" aria-live="off">{now ? formatTime(now, p.tz).replace(/\s\w+$/, "") : ""}</p>
          <button className="rounded-full border border-line px-3 py-2 text-xs text-muted" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>Full screen</button>
        </div>
      </header>

      <main className="grid flex-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-label="Today's chairs" className="grid auto-rows-min gap-4 md:grid-cols-2 xl:grid-cols-3">
          {p.closedLabel ? (
            <p className="font-display text-4xl">Closed today: {p.closedLabel}</p>
          ) : p.board.length === 0 ? (
            <p className="font-display text-3xl text-muted">No appointments on the books.</p>
          ) : (
            p.board.map((c) => (
              <article key={c.staffId} className="rounded-3xl border border-line bg-surface p-5">
                <h2 className="font-display text-3xl">{c.stylist}</h2>
                <ul className="mt-3 space-y-2">
                  {c.rows.map((r) => {
                    const [label, cls] = STATE[r.state];
                    return (
                      <li key={r.id} className={`rounded-2xl border border-transparent px-4 py-3 ${cls}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-mono text-xl">{formatTime(new Date(r.start), p.tz).replace(/\s\w+$/, "")}</span>
                          {label && <span className="text-sm font-semibold uppercase tracking-wide">{label}</span>}
                        </div>
                        <p className="text-2xl">{r.name}</p>
                        <p className={`text-base ${r.state === "now" ? "" : "text-muted"}`}>{r.services}</p>
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))
          )}
        </section>

        <aside className="flex min-h-80 flex-col rounded-3xl border border-line bg-surface p-8" aria-live="polite">
          <div key={current.key} className="flex flex-1 flex-col justify-center motion-safe:animate-[fadeIn_.8s_ease]">{current.node}</div>
          <div className="mt-6 flex justify-center gap-1.5" aria-hidden="true">
            {slides.map((s, i) => (
              <span key={s.key} className={`h-1.5 rounded-full transition-all ${i === slide % slides.length ? "w-6 bg-accent" : "w-1.5 bg-line"}`} />
            ))}
          </div>
        </aside>
      </main>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}

function BookSlide({ url }: { url: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-4xl">Love the look?</p>
      <p className="mt-2 text-xl text-muted">Book your next visit before you leave the chair.</p>
      <div className="mx-auto mt-6 w-fit rounded-2xl bg-white p-4">
        <QRCode text={url} className="size-56" label="Scan to book" />
      </div>
      <p className="mt-3 text-lg">Scan with your phone camera</p>
    </div>
  );
}

function OpenSlide({ openings, tz }: { openings: { stylist: string; start: string; minutes: number }[]; tz: string }) {
  return (
    <div>
      <p className="font-display text-4xl">Open today</p>
      <ul className="mt-4 space-y-3 text-2xl">
        {openings.slice(0, 5).map((o) => (
          <li key={`${o.stylist}${o.start}`} className="flex justify-between gap-4">
            <span>{o.stylist}</span>
            <span className="font-mono">{formatTime(new Date(o.start), tz).replace(/\s\w+$/, "")}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-lg text-muted">Ask at the front desk, or scan the booking code.</p>
    </div>
  );
}

function SpecialSlide({ code, text, until }: { code: string; text: string; until: string | null }) {
  return (
    <div className="text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-water">Special</p>
      <p className="mt-3 font-display text-5xl leading-tight">{text}</p>
      <p className="mt-6 text-xl">Use code</p>
      <p className="font-mono text-5xl tracking-widest">{code}</p>
      {until && <p className="mt-4 text-lg text-muted">Through {formatDay(until, { month: "long", day: "numeric" })}</p>}
    </div>
  );
}

function ReviewSlide({ text, name }: { text: string; name: string }) {
  return (
    <figure className="text-center">
      <p className="text-3xl text-amber-400" aria-label="5 stars">★★★★★</p>
      <blockquote className="mt-4 font-display text-3xl italic leading-snug">&ldquo;{text}&rdquo;</blockquote>
      <figcaption className="mt-4 text-xl text-muted">{name}</figcaption>
    </figure>
  );
}
