"use client";

/* eslint-disable @next/next/no-img-element -- screen pictures */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newSlide, SLIDE_TYPES, SLIDES, type ScreenSettings, type Slide, type SlideType } from "@/lib/screens/slides";
import { deleteScreen, newScreenLink, saveScreen } from "../actions";

type Media = { id: string; url: string; title: string | null };
const input = "w-full rounded-xl border border-line bg-background px-3 py-2 text-base";
const btn = "rounded-full border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50";

/** Name, who can see it, touch, and the playlist of a screen. */
export default function ScreenEditor({ screen, media, stylists }: { screen: { id: string; name: string; audience: "public" | "staff"; playlist: Slide[]; settings: ScreenSettings; link: string | null }; media: Media[]; stylists: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState(screen.name);
  const [audience, setAudience] = useState(screen.audience);
  const [settings, setSettings] = useState(screen.settings);
  const [slides, setSlides] = useState<Slide[]>(screen.playlist);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const hidden = audience === "public" ? slides.filter((s) => SLIDES[s.type].audience === "staff") : [];
  const update = (i: number, patch: Partial<Slide>) => setSlides(slides.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    setSlides(next);
  };
  const add = (t: SlideType) => {
    const s = newSlide(t);
    if (t === "image" && media[0]) s.mediaId = media[0].id;
    if (t === "message") s.title = "Holiday hours";
    setSlides([...slides, s]);
    setAdding(false);
  };

  const save = () =>
    start(async () => {
      const r = await saveScreen(screen.id, { name, audience, settings, playlist: slides });
      setMsg(r.ok ? { ok: true, text: "Saved. Screens showing it update within a minute." } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 pb-28">
      <header>
        <Link href="/app/screens" className="text-sm text-muted">‹ Screens</Link>
        <h1 className="font-display text-3xl">{name || "Screen"}</h1>
      </header>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <label className="block text-sm font-medium">Name<input className={`${input} mt-1`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Front window" /></label>
        <fieldset>
          <legend className="text-sm font-medium">Who can see it</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {([["public", "Anyone (public)", "Window or waiting area. Opens from a private link, no sign-in. Never shows client details."], ["staff", "Staff only", "Stations, front desk, color bar. Needs a signed-in device. Can show client names."]] as const).map(([v, l, h]) => (
              <label key={v} className={`cursor-pointer rounded-xl border p-3 text-sm ${audience === v ? "border-accent ring-1 ring-accent" : "border-line"}`}>
                <input type="radio" name="aud" className="sr-only" checked={audience === v} onChange={() => setAudience(v)} />
                <span className="block font-semibold">{l}</span>
                <span className="block text-muted">{h}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start justify-between gap-3 text-sm">
          <span><span className="font-medium">Touch screen</span><span className="block text-muted">Buttons to switch views and pause. Needed for Client card.</span></span>
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={settings.touch} onChange={(e) => setSettings({ ...settings, touch: e.target.checked })} />
        </label>
        <label className="flex items-start justify-between gap-3 text-sm">
          <span><span className="font-medium">Show salon name and clock</span><span className="block text-muted">Across the top of the screen.</span></span>
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={settings.header} onChange={(e) => setSettings({ ...settings, header: e.target.checked })} />
        </label>
      </section>

      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Playlist</h2>
          <span className="text-xs text-muted">Plays top to bottom, then repeats.</span>
        </div>
        {hidden.length > 0 && (
          <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            {hidden.map((s) => SLIDES[s.type].label).join(", ")} {hidden.length === 1 ? "is" : "are"} staff-only and will be removed when you save a public screen.
          </p>
        )}
        {slides.length === 0 && <p className="text-sm text-muted">Empty. Add a slide below.</p>}
        <ol className="space-y-2">
          {slides.map((s, i) => {
            const info = SLIDES[s.type];
            const staffOnly = info.audience === "staff";
            return (
              <li key={s.id} className={`rounded-xl border p-3 ${audience === "public" && staffOnly ? "border-amber-400 opacity-60" : "border-line"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-5 text-sm text-muted">{i + 1}.</span>
                  <span className="flex-1 font-medium">{info.label}{staffOnly && <span className="ml-1 text-xs text-muted">(staff)</span>}</span>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="number" min={5} max={600} className="w-16 rounded-lg border border-line bg-background px-2 py-1 text-right" value={s.seconds} onChange={(e) => update(i, { seconds: Number(e.target.value) })} aria-label={`${info.label} seconds on screen`} />s
                  </label>
                  <button type="button" className="px-2" aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="px-2" aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="px-2" aria-label="Remove" onClick={() => setSlides(slides.filter((_, j) => j !== i))}>×</button>
                </div>
                <SlideOptions slide={s} media={media} stylists={stylists} onChange={(p) => update(i, p)} />
              </li>
            );
          })}
        </ol>
        {adding ? (
          <div className="rounded-xl border border-line p-3">
            <p className="text-sm font-medium">Add a slide</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {SLIDE_TYPES.filter((t) => audience === "staff" || SLIDES[t].audience === "public").map((t) => (
                <li key={t}>
                  <button type="button" onClick={() => add(t)} disabled={t === "image" && !media.length} className="h-full w-full rounded-lg border border-line p-2 text-left text-sm hover:border-accent disabled:opacity-40">
                    <span className="font-medium">{SLIDES[t].label}</span>
                    <span className="block text-xs text-muted">{t === "image" && !media.length ? "Add a picture on the Screens page first." : SLIDES[t].hint}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-2 text-sm underline" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className={btn} onClick={() => setAdding(true)}>+ Add a slide</button>
        )}
      </section>

      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Put it on a screen</h2>
        {audience === "public" && screen.link ? (
          <>
            <p className="text-sm text-muted">Open this link in the TV&rsquo;s web browser (or a streaming stick or tablet) and make it full screen. Anyone with the link can see it, so keep it to your own devices.</p>
            <p className="break-all rounded-lg bg-background p-2 font-mono text-xs">{screen.link}</p>
            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={() => navigator.clipboard?.writeText(screen.link!).then(() => setMsg({ ok: true, text: "Link copied." }), () => {})}>Copy link</button>
              <a className={btn} href={screen.link} target="_blank" rel="noreferrer">Preview</a>
              <button className={btn} disabled={pending} onClick={() => confirm("Make a new link? Screens using the old one will stop until you open the new link on them.") && start(async () => { const r = await newScreenLink(screen.id); setMsg(r.ok ? { ok: true, text: "New link made." } : { ok: false, text: r.error }); })}>New link</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">On the device, sign in to Chairvana, then open Front desk → {name || "this screen"}. Staff screens only show what that person&rsquo;s access allows.</p>
            <Link className={btn} href={`/app/screens/${screen.id}/play`} target="_blank">Open here</Link>
          </>
        )}
        {audience !== screen.audience && <p className="text-xs text-muted">Save first to switch the link.</p>}
      </section>

      <button className="text-sm text-red-700 underline dark:text-red-300" disabled={pending} onClick={() => confirm(`Delete ${name}? Any device showing it will stop.`) && start(async () => { const r = await deleteScreen(screen.id); if (r.ok) router.push("/app/screens"); else setMsg({ ok: false, text: r.error }); })}>
        Delete this screen
      </button>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 [body:has(.tabbar)_&]:bottom-16">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-muted" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
          <button className="rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent disabled:opacity-40" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </main>
  );
}

function SlideOptions({ slide, media, stylists, onChange }: { slide: Slide; media: Media[]; stylists: { id: string; name: string }[]; onChange: (p: Partial<Slide>) => void }) {
  const t = slide.type;
  const until = (
    <label className="block text-xs text-muted">
      Show until (optional)
      <input type="date" className={`${input} mt-1 text-sm`} value={slide.until ?? ""} onChange={(e) => onChange({ until: e.target.value || undefined })} />
    </label>
  );
  if (t === "message") {
    return (
      <div className="mt-2 grid gap-2">
        <input className={input} value={slide.title ?? ""} maxLength={80} onChange={(e) => onChange({ title: e.target.value })} placeholder="Headline, e.g. Holiday hours" aria-label="Headline" />
        <textarea className={input} rows={3} value={slide.body ?? ""} maxLength={400} onChange={(e) => onChange({ body: e.target.value })} placeholder={"Closed Dec 24–25\nOpen Dec 26, 9 AM – 2 PM"} aria-label="Text" />
        {until}
      </div>
    );
  }
  if (t === "image") {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {media.map((m) => (
            <button key={m.id} type="button" onClick={() => onChange({ mediaId: m.id })} aria-pressed={slide.mediaId === m.id} className={`shrink-0 overflow-hidden rounded-lg border ${slide.mediaId === m.id ? "border-accent ring-2 ring-accent" : "border-line"}`}>
              <img src={m.url} alt={m.title ?? ""} className="size-20 bg-background object-contain" />
            </button>
          ))}
        </div>
        <input className={input} value={slide.title ?? ""} maxLength={80} onChange={(e) => onChange({ title: e.target.value })} placeholder="Caption (optional)" aria-label="Caption" />
        {until}
      </div>
    );
  }
  if ((t === "portfolio" || t === "today" || t === "board") && stylists.length > 1) {
    return (
      <label className="mt-2 block text-xs text-muted">
        Whose
        <select className={`${input} mt-1 text-sm`} value={slide.staffId ?? ""} onChange={(e) => onChange({ staffId: e.target.value || undefined })}>
          <option value="">Everyone</option>
          {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
    );
  }
  if (t === "specials" || t === "products") return <div className="mt-2">{until}</div>;
  return null;
}
