"use client";

/* eslint-disable @next/next/no-img-element -- salon photos */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { onAccent } from "@/lib/branding";
import type { Wrapped } from "@/lib/studio/wrapped";
import { draw, type Fonts, type Template } from "./draw";
import { uploadScreenImage } from "../../screens/actions";

type Props = {
  salon: string;
  bookUrl: string;
  /** chairvana.app/your-salon, printed on the image. */
  shortUrl?: string;
  accent: string;
  logoUrl: string | null;
  photos: { url: string; caption: string | null }[];
  specials: { code: string; text: string; until: string | null }[];
  reviews: { text: string; name: string }[];
  openings: string[];
  wrapped: Wrapped;
};

const TEMPLATES: { key: Template; label: string; hint: string; photo: boolean }[] = [
  { key: "openings", label: "Openings", hint: "This week's open times", photo: true },
  { key: "special", label: "Special", hint: "A promo code", photo: true },
  { key: "review", label: "Review", hint: "A 5-star quote", photo: true },
  { key: "book", label: "Book with us", hint: "Show off your work", photo: true },
  { key: "closed", label: "Hours notice", hint: "Holiday or closed days", photo: true },
  { key: "wrapped", label: "Chair Wrapped", hint: "Your year in numbers", photo: false },
];

const input = "w-full rounded-xl border border-line bg-background px-3 py-2.5 text-base";

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Pick sensible starting text for a template. */
function defaults(t: Template, p: Props, special: number, review: number): { headline: string; sub: string } {
  switch (t) {
    case "openings":
      return { headline: "This week", sub: "" };
    case "special": {
      const s = p.specials[special];
      return { headline: s?.text ?? "Something special", sub: s?.until ? `Through ${s.until}` : "" };
    }
    case "review": {
      const r = p.reviews[review];
      return { headline: r?.text ?? "Loved my visit!", sub: r?.name ?? "A happy client" };
    }
    case "book":
      return { headline: "Love the look?", sub: "Book your next visit online." };
    case "closed":
      return { headline: "Closed for the holiday", sub: "We'll be back soon. Book your next visit online any time." };
    case "wrapped":
      return { headline: `Thank you for an amazing ${p.wrapped.year}`, sub: "" };
  }
}

/** Make ready-to-post images for Instagram, Facebook and stories. */
export default function StudioView(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const probes = useRef<HTMLDivElement>(null);
  const [template, setTemplate] = useState<Template>(p.openings.length ? "openings" : "book");
  const [story, setStory] = useState(false);
  const [photoIdx, setPhotoIdx] = useState<number | null>(p.photos.length ? 0 : null);
  const [special, setSpecial] = useState(0);
  const [review, setReview] = useState(0);
  const [text, setText] = useState(() => defaults(p.openings.length ? "openings" : "book", p, 0, 0));
  const [fonts, setFonts] = useState<Fonts | null>(null);
  const [imgs, setImgs] = useState<{ photo: HTMLImageElement | null; logo: HTMLImageElement | null; mark: HTMLImageElement | null }>({ photo: null, logo: null, mark: null });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const meta = TEMPLATES.find((t) => t.key === template)!;
  const photoUrl = meta.photo && photoIdx !== null ? p.photos[photoIdx]?.url ?? null : null;

  // Read the page's real font stacks once the web fonts are in.
  useEffect(() => {
    let live = true;
    document.fonts.ready.then(() => {
      const el = probes.current;
      if (!live || !el) return;
      const f = (cls: string) => getComputedStyle(el.querySelector(`.${cls}`)!).fontFamily;
      setFonts({ display: f("font-display"), sans: f("font-sans"), mono: f("font-mono"), wordmark: f("font-wordmark") });
    });
    return () => {
      live = false;
    };
  }, []);

  // Load the logo, brand mark and chosen photo.
  useEffect(() => {
    let live = true;
    Promise.all([photoUrl ? loadImage(photoUrl) : null, p.logoUrl ? loadImage(p.logoUrl) : null, loadImage("/brand/mark-ivory.png")]).then(([photo, logo, mark]) => {
      if (live) setImgs({ photo, logo, mark });
    });
    return () => {
      live = false;
    };
  }, [photoUrl, p.logoUrl]);

  const code = template === "special" ? p.specials[special]?.code : undefined;
  const lines = useMemo(() => (template === "openings" ? p.openings : []), [template, p.openings]);

  useEffect(() => {
    if (!fonts || !canvas.current) return;
    draw(canvas.current, {
      template,
      w: 1080,
      h: story ? 1920 : 1080,
      salon: p.salon,
      url: p.shortUrl ?? p.bookUrl,
      accent: p.accent,
      onAccent: onAccent(p.accent),
      fonts,
      photo: imgs.photo,
      logo: imgs.logo,
      mark: imgs.mark,
      headline: text.headline,
      sub: text.sub,
      lines,
      code,
      wrapped: p.wrapped,
    });
  }, [fonts, imgs, template, story, text, lines, code, p.salon, p.bookUrl, p.shortUrl, p.accent, p.wrapped]);

  function pick(t: Template) {
    setTemplate(t);
    setText(defaults(t, p, special, review));
    setNote(null);
  }

  function blob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      try {
        canvas.current?.toBlob((b) => resolve(b), "image/png");
      } catch {
        resolve(null);
      }
    });
  }

  const fileName = `${p.salon.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${template}${story ? "-story" : ""}.png`;

  async function download() {
    setBusy(true);
    const b = await blob();
    setBusy(false);
    if (!b) return setNote("That photo can't be saved into an image. Try a different one.");
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Save the design to the picture library for salon screens. */
  async function toScreens() {
    setBusy(true);
    const b = await blob();
    if (!b) {
      setBusy(false);
      return setNote("That photo can't be saved into an image. Try a different one.");
    }
    const f = new FormData();
    f.set("file", new File([b], fileName, { type: "image/png" }));
    f.set("source", "studio");
    f.set("title", `${TEMPLATES.find((t) => t.key === template)?.label ?? "Design"}${story ? " (story)" : ""}`);
    const r = await uploadScreenImage(f);
    setBusy(false);
    setNote(r.ok ? "Sent to Screens. Add it to a playlist with a Picture slide." : r.error);
  }

  async function share() {
    setBusy(true);
    const b = await blob();
    setBusy(false);
    if (!b) return setNote("That photo can't be saved into an image. Try a different one.");
    const file = new File([b], fileName, { type: "image/png" });
    if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: `Book online: ${p.bookUrl}` }).catch(() => {});
    } else {
      setNote("Sharing isn't available in this browser, so we downloaded it instead.");
      await download();
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/app/marketing" className="text-sm text-muted">‹ Marketing</Link>
          <h1 className="font-display text-3xl">Graphics studio</h1>
          <p className="text-sm text-muted">Ready-to-post images in your colors, from your photos. Pick a design, tweak the words, then save or share.</p>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Design">
        {TEMPLATES.map((t) => (
          <button key={t.key} role="tab" aria-selected={template === t.key} onClick={() => pick(t.key)} className={`shrink-0 rounded-2xl border px-4 py-2 text-left ${template === t.key ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}>
            <span className="block text-sm font-semibold">{t.label}</span>
            <span className={`block text-xs ${template === t.key ? "" : "text-muted"}`}>{t.hint}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex justify-center rounded-3xl border border-line bg-surface p-4">
          <canvas ref={canvas} width={1080} height={1080} className={`h-auto rounded-xl shadow-lg ${story ? "w-full max-w-[340px]" : "w-full max-w-[560px]"}`} aria-label={`${meta.label} graphic preview`} />
        </div>

        <aside className="space-y-4">
          <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-semibold">Size</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                [false, "Post", "Square, 1080×1080"],
                [true, "Story", "Tall, 1080×1920"],
              ].map(([v, label, hint]) => (
                <button key={String(label)} onClick={() => setStory(v as boolean)} aria-pressed={story === v} className={`rounded-xl border px-3 py-2 text-left ${story === v ? "border-accent ring-1 ring-accent" : "border-line"}`}>
                  <span className="block text-sm font-semibold">{label as string}</span>
                  <span className="block text-xs text-muted">{hint as string}</span>
                </button>
              ))}
            </div>
          </section>

          {template === "special" && (
            <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <h2 className="font-semibold">Promo code</h2>
              {p.specials.length ? (
                <select className={input} value={special} onChange={(e) => { const i = Number(e.target.value); setSpecial(i); setText(defaults("special", p, i, review)); }}>
                  {p.specials.map((s, i) => <option key={s.code} value={i}>{s.code} · {s.text}</option>)}
                </select>
              ) : (
                <p className="text-sm text-muted">No active promo codes. <Link href="/app/marketing" className="underline">Add one</Link>, or just type your special below.</p>
              )}
            </section>
          )}

          {template === "review" && p.reviews.length > 1 && (
            <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <h2 className="font-semibold">Review</h2>
              <select className={input} value={review} onChange={(e) => { const i = Number(e.target.value); setReview(i); setText(defaults("review", p, special, i)); }}>
                {p.reviews.map((r, i) => <option key={i} value={i}>{r.name}: {r.text.slice(0, 50)}</option>)}
              </select>
            </section>
          )}

          <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-semibold">Words</h2>
            <label className="block text-sm">
              <span className="text-muted">{template === "review" ? "Quote" : "Headline"}</span>
              <textarea className={input} rows={template === "review" ? 4 : 2} value={text.headline} maxLength={220} onChange={(e) => setText({ ...text, headline: e.target.value })} />
            </label>
            {template !== "openings" && template !== "wrapped" && (
              <label className="block text-sm">
                <span className="text-muted">{template === "review" ? "Name" : "Smaller line"}</span>
                <input className={input} value={text.sub} maxLength={140} onChange={(e) => setText({ ...text, sub: e.target.value })} />
              </label>
            )}
            {template === "openings" && !p.openings.length && <p className="text-xs text-muted">Your week is full, so the graphic says to ask about times.</p>}
            {template === "wrapped" && <p className="text-xs text-muted">{p.wrapped.visits} visits, {p.wrapped.clients} clients and {p.wrapped.newClients} new faces so far in {p.wrapped.year}.</p>}
          </section>

          {meta.photo && (
            <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <h2 className="font-semibold">Photo</h2>
              {p.photos.length ? (
                <div className="grid grid-cols-4 gap-2">
                  <button onClick={() => setPhotoIdx(null)} aria-pressed={photoIdx === null} className={`grid aspect-square place-items-center rounded-lg border bg-[#0f0f11] text-[10px] text-[#f5efe6] ${photoIdx === null ? "border-accent ring-2 ring-accent" : "border-line"}`}>None</button>
                  {p.photos.map((ph, i) => (
                    <button key={ph.url} onClick={() => setPhotoIdx(i)} aria-pressed={photoIdx === i} className={`overflow-hidden rounded-lg border ${photoIdx === i ? "border-accent ring-2 ring-accent" : "border-line"}`}>
                      <img src={ph.url} alt={ph.caption ?? "Salon photo"} className="aspect-square w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Add photos in <Link href="/app/settings/salon" className="underline">Settings → Salon</Link> to put your work behind the words.</p>
              )}
            </section>
          )}

          <div className="flex gap-2">
            <button onClick={download} disabled={busy || !fonts} className="flex-1 rounded-full bg-accent px-4 py-3 font-semibold text-on-accent disabled:opacity-50">Save image</button>
            <button onClick={share} disabled={busy || !fonts} className="flex-1 rounded-full border border-line px-4 py-3 font-semibold disabled:opacity-50">Share</button>
          </div>
          <button onClick={toScreens} disabled={busy || !fonts} className="w-full rounded-full border border-line px-4 py-3 font-semibold disabled:opacity-50">Send to salon screens</button>
          {note && <p className="text-sm text-muted" role="status">{note}</p>}
          <p className="text-xs text-muted">Tip: on Instagram, add a link sticker to your story pointing to your booking link.</p>
        </aside>
      </div>

      <div ref={probes} aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
        <span className="font-display">a</span>
        <span className="font-sans">a</span>
        <span className="font-mono">a</span>
        <span className="font-wordmark">a</span>
      </div>
    </main>
  );
}
