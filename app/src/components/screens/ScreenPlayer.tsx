"use client";

/* eslint-disable @next/next/no-img-element -- salon photos and designs */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "@/components/QRCode";
import { accentStyle } from "@/lib/branding";
import { money } from "@/lib/format";
import type { ScreenData } from "@/lib/screens/data";
import { SLIDES, type ScreenSettings, type Slide } from "@/lib/screens/slides";
import { formatDay, formatTime } from "@/lib/time/zone";
import ClientCard, { type ClientCardApi } from "./ClientCard";
import ColorWheel from "./ColorWheel";

const time = (iso: string, tz: string) => formatTime(new Date(iso), tz).replace(/\s[A-Z]{2,5}$/, "");
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);

/** Full-screen player: rotates through the playlist, refreshes its data every minute. */
export default function ScreenPlayer({ name, slides, settings, data, clientCard }: { name: string; slides: Slide[]; settings: ScreenSettings; data: ScreenData; clientCard?: ClientCardApi }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(false);
  const tz = data.salon.tz;
  const current = slides.length ? slides[index % slides.length] : null;

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const c = setInterval(tick, 1000);
    const r = setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(c);
      clearInterval(r);
    };
  }, [router]);

  useEffect(() => {
    if (!current || paused || slides.length < 2) return;
    const t = setTimeout(() => {
      setIndex((i) => (i + 1) % slides.length);
      setCycle((c) => c + 1);
    }, current.seconds * 1000);
    return () => clearTimeout(t);
  }, [current, paused, slides.length, index]);

  const go = (i: number) => {
    setIndex(i);
    setCycle((c) => c + 1);
  };

  return (
    <div className="brand-dark flex min-h-dvh flex-col gap-4 p-4 sm:p-6 lg:p-10" style={accentStyle({ accent: data.salon.accent }) as React.CSSProperties | undefined}>
      {settings.header && (
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {data.salon.logoUrl ? <img src={data.salon.logoUrl} alt="" className="size-10 shrink-0 rounded-xl object-cover sm:size-14" /> : <img src="/brand/mark-ivory.png" alt="" className="h-9 w-auto shrink-0 sm:h-12" />}
            <div className="min-w-0">
              <p className="truncate font-display text-2xl leading-none sm:text-4xl">{data.salon.name}</p>
              <p className="mt-1 text-sm text-muted sm:text-lg">{formatDay(data.salon.today, { weekday: "long", month: "long", day: "numeric" })}</p>
            </div>
          </div>
          <p className="shrink-0 font-mono text-2xl tabular-nums sm:text-5xl" aria-live="off">{now ? time(now.toISOString(), tz) : ""}</p>
        </header>
      )}

      <main className="flex flex-1 flex-col rounded-3xl border border-line bg-surface p-5 sm:p-8">
        {current ? (
          <div key={`${current.id}-${cycle}`} className="flex flex-1 flex-col justify-center motion-safe:animate-[screenIn_.7s_ease]">
            <SlideView slide={current} data={data} cycle={cycle} now={now} clientCard={clientCard} onBusy={setPaused} />
          </div>
        ) : (
          <p className="m-auto text-center text-xl text-muted">This screen has no slides yet. Add some under Screens in the app.</p>
        )}
      </main>

      {settings.touch && slides.length > 1 ? (
        <nav aria-label={`${name} views`} className="flex flex-wrap items-center gap-2">
          {slides.map((s, i) => (
            <button key={s.id} onClick={() => go(i)} aria-current={i === index % slides.length} className={`rounded-full border px-4 py-2.5 text-base ${i === index % slides.length ? "border-accent bg-accent text-on-accent" : "border-line"}`}>
              {s.title && s.type !== "message" ? s.title : SLIDES[s.type].label}
            </button>
          ))}
          <button onClick={() => setPaused(!paused)} className="ml-auto rounded-full border border-line px-4 py-2.5 text-base" aria-pressed={paused}>
            {paused ? "▶ Play" : "❚❚ Pause"}
          </button>
        </nav>
      ) : slides.length > 1 ? (
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {slides.map((s, i) => <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === index % slides.length ? "w-6 bg-accent" : "w-1.5 bg-line"}`} />)}
        </div>
      ) : null}
      <style>{`@keyframes screenIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}

function pick<T>(list: T[], cycle: number, n: number): T[] {
  if (list.length <= n) return list;
  const start = (cycle * n) % list.length;
  return Array.from({ length: n }, (_, i) => list[(start + i) % list.length]);
}

function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-4xl leading-tight sm:text-5xl">{children}</h2>
      {sub && <p className="mt-1 text-lg text-muted sm:text-xl">{sub}</p>}
    </div>
  );
}

function SlideView({ slide, data, cycle, now, clientCard, onBusy }: { slide: Slide; data: ScreenData; cycle: number; now: Date | null; clientCard?: ClientCardApi; onBusy: (b: boolean) => void }) {
  const tz = data.salon.tz;
  const firstName = (id?: string) => (id ? data.stylists.find((s) => s.id === id)?.name.split(" ")[0] : undefined);
  switch (slide.type) {
    case "hours": {
      const h = data.hours;
      if (!h) return null;
      return (
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <p className={`inline-block rounded-2xl px-8 py-4 font-display text-7xl tracking-wide sm:text-8xl ${h.status.open ? "bg-accent text-on-accent" : "border-2 border-line"}`}>{h.status.open ? "OPEN" : "CLOSED"}</p>
            <p className="mt-4 text-2xl sm:text-3xl">{h.status.line}</p>
            {h.status.reason && h.status.reason !== "Closed" && <p className="mt-1 text-xl text-muted">{h.status.reason}</p>}
          </div>
          <ul className="space-y-2 text-xl sm:text-2xl">
            {h.week.map((d) => (
              <li key={d.date} className={`flex justify-between gap-4 border-b border-line pb-2 ${d.label === "Today" ? "font-semibold" : ""} ${d.closed ? "text-muted" : ""}`}>
                <span>{d.label}</span>
                <span className="text-right tabular-nums">{d.text}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "book":
      return (
        <div className="text-center">
          <Title sub="Point your phone camera at the code.">Book your next visit</Title>
          <div className="mx-auto w-fit rounded-2xl bg-white p-4"><QRCode text={data.salon.bookUrl} className="size-56 sm:size-72" label="Scan to book" /></div>
          <p className="mt-4 font-mono text-2xl">{data.salon.shortUrl}</p>
        </div>
      );
    case "specials": {
      const list = pick(data.specials ?? [], cycle, 3);
      if (!list.length) return <Empty text="No specials running right now." />;
      return (
        <div>
          <Title>Specials</Title>
          <div className="grid gap-4 md:grid-cols-3">
            {list.map((s) => (
              <div key={s.code} className="rounded-2xl border border-line p-5">
                <p className="font-display text-3xl leading-tight">{s.text}</p>
                <p className="mt-3 text-lg text-muted">Use code</p>
                <p className="font-mono text-3xl tracking-widest">{s.code}</p>
                {s.until && <p className="mt-2 text-muted">Through {s.until}</p>}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "reviews": {
      const r = pick(data.reviews ?? [], cycle, 1)[0];
      if (!r) return <Empty text="5-star reviews will show here." />;
      return (
        <figure className="mx-auto max-w-4xl text-center">
          <p className="text-4xl text-amber-400" aria-label="5 stars">★★★★★</p>
          <blockquote className="mt-4 font-display text-4xl italic leading-snug sm:text-5xl">&ldquo;{r.text}&rdquo;</blockquote>
          <figcaption className="mt-4 text-2xl text-muted">{r.name}</figcaption>
        </figure>
      );
    }
    case "portfolio": {
      const mine = (data.photos ?? []).filter((p) => !slide.staffId || p.staffId === slide.staffId);
      const list = pick(mine, cycle, 3);
      if (!list.length) return <Empty text="Add photos in Settings → Salon → Look & photos." />;
      return (
        <div>
          <Title>{slide.title ?? (firstName(slide.staffId) ? `${firstName(slide.staffId)}'s work` : "Our work")}</Title>
          <div className="grid gap-4 md:grid-cols-3">
            {list.map((p) => (
              <figure key={p.url} className="overflow-hidden rounded-2xl border border-line">
                <img src={p.url} alt={p.caption ?? ""} className="aspect-[4/5] w-full object-cover" />
                {p.caption && <figcaption className="p-3 text-lg">{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      );
    }
    case "products": {
      const list = pick(data.products ?? [], cycle, 6);
      if (!list.length) return <Empty text="Retail products in stock, with a price, show here." />;
      return (
        <div>
          <Title sub="Ask your stylist which is right for you.">{slide.title ?? "Take the salon home"}</Title>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <li key={`${p.brand}${p.name}`} className="rounded-2xl border border-line p-4">
                <p className="text-sm uppercase tracking-wide text-muted">{p.brand}</p>
                <p className="text-2xl">{p.name}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{money(p.priceCents)}</p>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "image": {
      const m = slide.mediaId ? data.media?.[slide.mediaId] : undefined;
      if (!m) return <Empty text="This picture was removed." />;
      return (
        <figure className="flex flex-1 flex-col items-center justify-center">
          <img src={m.url} alt={slide.title ?? m.title ?? ""} className="max-h-[70dvh] w-auto max-w-full rounded-2xl object-contain" />
          {slide.title && <figcaption className="mt-3 text-2xl">{slide.title}</figcaption>}
        </figure>
      );
    }
    case "message":
      return (
        <div className="mx-auto max-w-4xl text-center">
          {slide.title && <h2 className="font-display text-5xl leading-tight sm:text-7xl">{slide.title}</h2>}
          {slide.body && <p className="mt-5 whitespace-pre-line text-2xl leading-relaxed text-muted sm:text-3xl">{slide.body}</p>}
        </div>
      );
    case "openings": {
      const list = data.openings ?? [];
      return (
        <div>
          <Title sub={list.length ? "Ask at the front desk, or scan to book." : undefined}>Open today</Title>
          {list.length ? (
            <ul className="space-y-3 text-2xl sm:text-3xl">
              {list.slice(0, 8).map((o) => (
                <li key={`${o.stylist}${o.start}`} className="flex justify-between gap-4 border-b border-line pb-2">
                  <span>{o.stylist}</span>
                  <span className="font-mono">{time(o.start, tz)} <span className="text-lg text-muted">· {hm(o.minutes)} open</span></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-2xl text-muted">We&rsquo;re fully booked today. Scan the booking code for the next opening.</p>
          )}
        </div>
      );
    }
    case "team":
      return (
        <div>
          <Title>Meet the team</Title>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.stylists.map((s) => (
              <li key={s.id} className="rounded-2xl border border-line p-5">
                <p className="font-display text-3xl">{s.name}</p>
                {s.title && <p className="text-xl text-muted">{s.title}</p>}
              </li>
            ))}
          </ul>
        </div>
      );
    case "board": {
      const b = data.board;
      if (!b) return null;
      const cols = slide.staffId ? b.columns.filter((c) => c.staffId === slide.staffId) : b.columns;
      if (!cols.length || cols.every((c) => c.rows.every((r) => r.state === "done"))) return <NextUp line={b.next} />;
      return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cols.map((c) => (
            <article key={c.staffId} className="rounded-2xl border border-line p-4">
              <h2 className="font-display text-3xl">{c.stylist}</h2>
              <ul className="mt-3 space-y-2">
                {c.rows.filter((r) => r.state !== "done").map((r) => (
                  <li key={r.id} className={`rounded-xl border px-4 py-3 ${r.state === "now" ? "border-accent bg-accent text-on-accent" : r.state === "here" ? "border-accent" : "border-line"}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-xl">{time(r.start, tz)}</span>
                      <span className="text-sm font-semibold uppercase tracking-wide">{r.state === "now" ? "In the chair" : r.state === "here" ? "Checked in" : r.state === "next" ? "Next" : ""}</span>
                    </div>
                    <p className="text-2xl">{r.name}</p>
                    <p className={r.state === "now" ? "" : "text-muted"}>{r.services}</p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      );
    }
    case "today": {
      const t = data.today;
      if (!t) return null;
      const appts = slide.staffId ? t.appts.filter((a) => a.staffId === slide.staffId) : t.appts;
      const live = appts.filter((a) => a.status !== "completed" && Date.parse(a.end) > (now?.getTime() ?? 0));
      return (
        <div>
          <Title sub={`${appts.length} appointment${appts.length === 1 ? "" : "s"} today${live.length !== appts.length ? `, ${live.length} still to go` : ""}`}>{slide.title ?? (firstName(slide.staffId) ? `${firstName(slide.staffId)}'s day` : "Today's schedule")}</Title>
          {live.length ? (
            <ul className="divide-y divide-line">
              {live.map((a) => (
                <li key={a.id} className="grid grid-cols-[6.5rem_1fr] gap-3 py-3 sm:grid-cols-[8rem_1fr_auto]">
                  <span className="font-mono text-xl">{time(a.start, tz)}</span>
                  <span>
                    <span className="block text-2xl">{a.name}{a.quiet && <span className="ml-2 align-middle text-base text-muted">☾ quiet</span>}</span>
                    <span className="block text-lg text-muted">{a.services.join(" + ")}{data.stylists.length > 1 && !slide.staffId ? ` · ${firstName(a.staffId)}` : ""}</span>
                    {a.notes && <span className="block text-base text-muted">Note: {a.notes}</span>}
                  </span>
                  <span className="hidden text-sm font-semibold uppercase tracking-wide sm:block">{a.status === "in_service" ? "In the chair" : a.status === "checked_in" ? "Checked in" : a.status === "pending" ? "Deposit due" : ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <NextUp line={t.next} />
          )}
        </div>
      );
    }
    case "week":
      return (
        <div>
          <Title sub="Days with open time stand out.">The week ahead</Title>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {(data.week ?? []).map((d) => <DayTile key={d.date} d={d} label={d.label} />)}
          </ul>
          <Legend />
        </div>
      );
    case "month": {
      const m = data.month;
      if (!m) return null;
      return (
        <div>
          <Title>{formatDay(m.first, { month: "long", year: "numeric" })}</Title>
          <div className="grid grid-cols-7 gap-1.5 text-center text-sm text-muted">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}</div>
          <ul className="mt-1 grid grid-cols-7 gap-1.5">
            {m.days.map((d) => (
              <li key={d.date} className={`rounded-lg border p-1.5 text-left ${d.date.slice(0, 7) !== m.first.slice(0, 7) ? "opacity-30" : ""} ${LOAD[d.load]} ${d.date === data.salon.today ? "ring-2 ring-accent" : ""}`}>
                <span className="block text-lg font-semibold">{Number(d.date.slice(8))}</span>
                <span className="block truncate text-xs">{d.load === "closed" ? (d.closedReason && d.closedReason !== "Closed" ? d.closedReason : "Closed") : `${d.booked} booked`}</span>
              </li>
            ))}
          </ul>
          <Legend />
        </div>
      );
    }
    case "inventory": {
      const list = data.inventory ?? [];
      return (
        <div>
          <Title sub={list.length ? "Low or out of stock." : undefined}>Reorder</Title>
          {list.length ? (
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {list.slice(0, 18).map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-xl">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className={`shrink-0 text-base font-semibold ${p.level === "out" ? "text-red-400" : "text-amber-300"}`}>{p.level === "out" ? "Out" : `${p.onHand} left`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-2xl text-muted">Nothing to reorder. Everything is stocked.</p>
          )}
        </div>
      );
    }
    case "colorwheel":
      return <ColorWheel />;
    case "clientcard":
      return clientCard ? <ClientCard api={clientCard} onBusy={onBusy} /> : <Empty text="Client lookup works on signed-in staff screens." />;
  }
}

const LOAD: Record<string, string> = {
  open: "border-accent bg-accent/25",
  busy: "border-amber-400/60 bg-amber-400/10",
  full: "border-line",
  closed: "border-line text-muted",
};

function DayTile({ d, label }: { d: { load: string; booked: number; freeMinutes: number; closedReason: string | null }; label: string }) {
  return (
    <li className={`rounded-2xl border p-4 ${LOAD[d.load]}`}>
      <p className="text-lg font-semibold">{label}</p>
      {d.load === "closed" ? (
        <p className="mt-2 text-lg">{d.closedReason && d.closedReason !== "Closed" ? d.closedReason : "Closed"}</p>
      ) : (
        <>
          <p className="mt-2 text-3xl tabular-nums">{d.booked}</p>
          <p className="text-sm text-muted">booked</p>
          <p className="mt-1 text-lg">{d.freeMinutes >= 30 ? `${hm(d.freeMinutes)} open` : "Full"}</p>
        </>
      )}
    </li>
  );
}

function Legend() {
  return (
    <p className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
      <span><span className="mr-1 inline-block size-3 rounded-sm border border-accent bg-accent/25 align-middle" />Plenty open</span>
      <span><span className="mr-1 inline-block size-3 rounded-sm border border-amber-400/60 bg-amber-400/10 align-middle" />A little open</span>
      <span><span className="mr-1 inline-block size-3 rounded-sm border border-line align-middle" />Full or closed</span>
    </p>
  );
}

function NextUp({ line }: { line: string | null }) {
  return <p className="mx-auto max-w-3xl text-center font-display text-3xl leading-snug sm:text-4xl">{line ?? "No more appointments today."}</p>;
}

function Empty({ text }: { text: string }) {
  return <p className="m-auto text-center text-2xl text-muted">{text}</p>;
}

