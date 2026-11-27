"use client";

/* eslint-disable @next/next/no-img-element -- user photos from storage */
import { useRef, useState, useTransition } from "react";
import { ACCENT_PRESETS, onAccent } from "@/lib/branding";
import { shrinkImage } from "@/lib/ui/resize";
import { deletePhoto, removeBrandImage, setAccent, uploadSalonImage } from "./branding-actions";

type Photo = { id: string; url: string; caption: string | null; staff: string | null };
const btn = "rounded-full border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50";

export default function BrandingForm({ name, accent, logoUrl, coverUrl, photos, stylists }: { name: string; accent: string | null; logoUrl: string | null; coverUrl: string | null; photos: Photo[]; stylists: { id: string; name: string }[] }) {
  const [color, setColor] = useState(accent ?? "#3f6a84");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const upload = (kind: "logo" | "cover" | "photo", file: File, extra: Record<string, string> = {}) =>
    start(async () => {
      setMsg(null);
      try {
        const small = await shrinkImage(file, kind === "logo" ? 800 : 1800);
        const f = new FormData();
        f.set("kind", kind);
        f.set("file", small);
        for (const [k, v] of Object.entries(extra)) f.set(k, v);
        const r = await uploadSalonImage(f);
        setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
      } catch {
        setMsg({ ok: false, text: "Couldn't read that picture." });
      }
    });

  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 pb-10">
      <div>
        <h2 className="font-display text-2xl">Look &amp; photos</h2>
        <p className="text-sm text-muted">Your logo, cover photo and color on your salon page and online booking.</p>
      </div>

      {/* Preview */}
      <div className="overflow-hidden rounded-2xl border border-line">
        <div className="relative h-36 bg-[#0f0f11]">
          {coverUrl && <img src={coverUrl} alt="" className="absolute inset-0 size-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
          <div className="absolute bottom-3 left-4 flex items-end gap-3">
            <span className="flex size-14 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-[#17171b] font-display text-xl text-[#f5efe6]">
              {logoUrl ? <img src={logoUrl} alt="" className="size-full object-cover" /> : name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
            </span>
            <span className="font-display text-2xl text-[#f5efe6]">{name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-surface p-3">
          <span className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: color, color: onAccent(color) }}>Book now</span>
          <span className="text-xs text-muted">Buttons and highlights use your color.</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Picker label="Logo" hint="Square works best." has={!!logoUrl} pending={pending} onPick={(f) => upload("logo", f)} onRemove={() => start(async () => void (await removeBrandImage("logo")))} />
        <Picker label="Cover photo" hint="Wide photo of your space or your work." has={!!coverUrl} pending={pending} onPick={(f) => upload("cover", f)} onRemove={() => start(async () => void (await removeBrandImage("cover")))} />
      </div>

      <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        <p className="font-semibold">Accent color</p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_PRESETS.map(([label, hex]) => (
            <button key={hex} type="button" aria-label={label} aria-pressed={color === hex} onClick={() => setColor(hex)} className={`size-10 rounded-full border-2 ${color === hex ? "border-foreground" : "border-transparent"}`} style={{ background: hex }} title={label} />
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-10 cursor-pointer rounded-full border border-line bg-transparent" aria-label="Custom color" />
            Custom
          </label>
        </div>
        <div className="flex gap-2">
          <button className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50" disabled={pending} onClick={() => start(async () => { const r = await setAccent(color); setMsg(r.ok ? { ok: true, text: "Color saved." } : { ok: false, text: r.error }); })}>Save color</button>
          {accent && <button className={btn} disabled={pending} onClick={() => start(async () => { await setAccent(null); setMsg({ ok: true, text: "Back to the Chairvana color." }); })}>Use default</button>}
        </div>
      </div>

      <Portfolio photos={photos} stylists={stylists} pending={pending} onUpload={(f, extra) => upload("photo", f, extra)} onDelete={(id) => start(async () => void (await deletePhoto(id)))} />

      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
    </section>
  );
}

function Picker({ label, hint, has, pending, onPick, onRemove }: { label: string; hint: string; has: boolean; pending: boolean; onPick: (f: File) => void; onRemove: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="font-semibold">{label}</p>
      <p className="text-xs text-muted">{hint}</p>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
      <div className="mt-2 flex gap-2">
        <button className={btn} disabled={pending} onClick={() => ref.current?.click()}>{has ? "Change" : "Upload"}</button>
        {has && <button className={btn} disabled={pending} onClick={onRemove}>Remove</button>}
      </div>
    </div>
  );
}

function Portfolio({ photos, stylists, pending, onUpload, onDelete }: { photos: Photo[]; stylists: { id: string; name: string }[]; pending: boolean; onUpload: (f: File, extra: Record<string, string>) => void; onDelete: (id: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [staffId, setStaffId] = useState("");
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div>
        <p className="font-semibold">Portfolio</p>
        <p className="text-xs text-muted">Your best work, shown on your salon page. Only post photos clients agreed to share.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input className="rounded-xl border border-line bg-background px-3 py-2 text-base" placeholder="Caption (optional), e.g. Copper balayage" value={caption} onChange={(e) => setCaption(e.target.value)} />
        {stylists.length > 1 && (
          <select className="rounded-xl border border-line bg-background px-3 py-2" value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Stylist">
            <option value="">Any stylist</option>
            {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <button className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50" disabled={pending} onClick={() => ref.current?.click()}>{pending ? "Uploading…" : "+ Add photos"}</button>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          for (const f of Array.from(e.target.files ?? []).slice(0, 10)) onUpload(f, { caption, staffId });
          setCaption("");
          e.target.value = "";
        }}
      />
      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <li key={p.id} className="group relative overflow-hidden rounded-xl">
              <img src={p.url} alt={p.caption ?? "Portfolio photo"} className="aspect-square w-full object-cover" loading="lazy" />
              {p.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] text-white">{p.caption}</span>}
              <button className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Delete photo" disabled={pending} onClick={() => { if (confirm("Delete this photo?")) onDelete(p.id); }}>×</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No photos yet.</p>
      )}
    </div>
  );
}
