"use client";

/* eslint-disable @next/next/no-img-element -- screen pictures */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TEMPLATES } from "@/lib/screens/slides";
import { shrinkImage } from "@/lib/ui/resize";
import { createScreen, deleteScreenImage, uploadScreenImage } from "./actions";

type ScreenRow = { id: string; name: string; audience: "public" | "staff"; link: string | null; slides: number; touch: boolean; tvs?: { total: number; on: number } };
type Media = { id: string; url: string; title: string | null; source: "upload" | "studio" | "brand" };

const card = "rounded-2xl border border-line bg-surface p-4";
const btn = "rounded-full border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50";

const SOURCE: Record<Media["source"], string> = { upload: "Upload", studio: "Graphics studio", brand: "Brand material" };

/** All the salon's screens, ready-made screen types, and pictures for screens. */
export default function ScreensView({ screens, media }: { screens: ScreenRow[]; media: Media[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = (key: string) =>
    start(async () => {
      const r = await createScreen(key, "");
      if (r.ok) router.push(`/app/screens/${r.id}`);
      else setMsg(r.error);
    });

  const upload = (file: File, source: "upload" | "brand") =>
    start(async () => {
      const small = await shrinkImage(file, 1920, 0.88);
      const f = new FormData();
      f.set("file", small);
      f.set("source", source);
      f.set("title", file.name.replace(/\.[^.]+$/, "").slice(0, 80));
      const r = await uploadScreenImage(f);
      setMsg(r.ok ? "Picture added. Use it in a screen with a Picture slide." : r.error);
    });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Link copied. Open it in the TV's web browser.");
    } catch {
      setMsg(text);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-4">
      <header>
        <h1 className="font-display text-3xl">Screens</h1>
        <p className="text-sm text-muted">TVs, tablets and smart boards around the salon, each with its own playlist. To put one on a TV, open <strong>chairvana.app/tv</strong> on the TV and pair it from the screen&rsquo;s page. Public screens never show client details.</p>
      </header>
      {msg && <p role="status" className="rounded-xl border border-line bg-surface p-3 text-sm">{msg}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">Your screens</h2>
        {screens.length === 0 && <p className="text-sm text-muted">No screens yet. Add one below.</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {screens.map((s) => (
            <li key={s.id} className={card}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.audience === "public" ? "Public" : "Staff only"} · {s.slides} slide{s.slides === 1 ? "" : "s"}{s.touch ? " · touch" : ""}
                  </p>
                  {s.tvs && s.tvs.total > 0 && (
                    <p className={`text-xs ${s.tvs.on < s.tvs.total ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted"}`}>
                      {s.tvs.on} of {s.tvs.total} TV{s.tvs.total === 1 ? "" : "s"} on{s.tvs.on < s.tvs.total ? ": check the one that's off" : ""}
                    </p>
                  )}
                  {s.slides === 0 && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Empty playlist</p>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.audience === "public" ? "bg-accent/15" : "bg-amber-400/20"}`}>{s.audience === "public" ? "Anyone can see" : "Staff"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/app/screens/${s.id}`} className={btn}>Edit</Link>
                <Link href={`/app/screens/${s.id}/play`} className={btn} target="_blank">Open here</Link>
                <Link href={`/app/screens/${s.id}/remote`} className={btn}>Remote</Link>
                {s.link && <button className={btn} onClick={() => copy(s.link!)}>Copy TV link</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Add a screen</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <li key={t.key}>
              <button disabled={pending} onClick={() => add(t.key)} className={`${card} h-full w-full text-left hover:border-accent disabled:opacity-50`}>
                <span className="block font-semibold">{t.name}</span>
                <span className="block text-sm text-muted">{t.hint}</span>
                <span className="mt-2 block text-xs text-muted">{t.audience === "public" ? "Public" : "Staff only"}{t.touch ? " · touch" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Pictures for screens</h2>
            <p className="text-sm text-muted">Designs from the Graphics studio land here automatically. You can also upload your own, or brand material from your suppliers.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/app/marketing/studio" className={btn}>Graphics studio</Link>
            <label className={`${btn} cursor-pointer`}>
              Upload
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={pending} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "upload")} />
            </label>
          </div>
        </div>
        {media.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {media.map((m) => (
              <li key={m.id} className="overflow-hidden rounded-xl border border-line">
                <img src={m.url} alt={m.title ?? ""} className="aspect-square w-full bg-background object-contain" />
                <div className="flex items-center justify-between gap-1 p-2 text-xs">
                  <span className="min-w-0 truncate" title={m.title ?? ""}>{m.title ?? SOURCE[m.source]}<span className="block text-muted">{SOURCE[m.source]}</span></span>
                  <button className="text-muted underline" disabled={pending} onClick={() => confirm("Remove this picture? Slides using it will skip it.") && start(async () => void (await deleteScreenImage(m.id)))}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No pictures yet.</p>
        )}
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="font-semibold">Brand materials from your suppliers</h2>
        <p className="text-sm text-muted">
          SalonCentric and CosmoProf, and the brands they carry, share ready-made promotions, product photos and posters with licensed pros. Sign in to their pro sites, download the pictures you want, then add them here. They don&rsquo;t offer a way to pull their catalogs in automatically.
        </p>
        <div className="flex flex-wrap gap-2">
          <a className={btn} href="https://www.saloncentric.com" target="_blank" rel="noreferrer">SalonCentric</a>
          <a className={btn} href="https://www.cosmoprofbeauty.com" target="_blank" rel="noreferrer">CosmoProf</a>
          <label className={`${btn} cursor-pointer`}>
            Add brand material
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={pending} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "brand")} />
          </label>
        </div>
        <p className="text-xs text-muted">Use brand materials only as the brand or supplier allows (usually fine in your own salon to promote products you carry).</p>
      </section>
    </main>
  );
}
