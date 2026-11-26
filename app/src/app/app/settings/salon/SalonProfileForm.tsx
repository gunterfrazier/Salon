"use client";

import { useState, useTransition } from "react";
import { slugify } from "@/lib/geo";
import { saveSalonProfile, type SalonFields } from "./actions";

const input = "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base";

/** The salon's public profile and listing. */
export default function SalonProfileForm({ initial, status, located }: { initial: SalonFields; status: string; located: boolean }) {
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();
  const [isLocated, setLocated] = useState(located);
  const set = (k: keyof SalonFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const slug = slugify(f.slug || f.name);

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Salon profile</h1>
        <p className="text-sm text-muted">What clients see on your page and in search.</p>
      </div>
      {status !== "approved" && <p className="rounded-xl border border-line bg-surface p-3 text-sm">Your salon is {status === "pending" ? "waiting for approval" : "suspended"}, so it isn&apos;t public yet.</p>}

      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <label className="block text-sm font-medium">Salon name<input className={`${input} mt-1`} value={f.name} onChange={set("name")} /></label>
        <label className="block text-sm font-medium">
          Web address
          <div className="mt-1 flex items-center gap-1">
            <span className="text-sm text-muted">chairvana.app/s/</span>
            <input className={input} value={f.slug} onChange={set("slug")} placeholder={slugify(f.name)} aria-label="Web address" />
          </div>
          <a className="text-xs underline" href={`/s/${slug}`} target="_blank" rel="noreferrer">View your page</a>
        </label>
        <label className="block text-sm font-medium">Street address<input className={`${input} mt-1`} value={f.street} onChange={set("street")} autoComplete="street-address" /></label>
        <div className="grid grid-cols-[1fr_5rem_7rem] gap-2">
          <label className="text-sm font-medium">City<input className={`${input} mt-1`} value={f.city} onChange={set("city")} /></label>
          <label className="text-sm font-medium">State<input className={`${input} mt-1`} value={f.state} onChange={set("state")} maxLength={2} placeholder="AL" /></label>
          <label className="text-sm font-medium">ZIP<input className={`${input} mt-1`} value={f.zip} onChange={set("zip")} inputMode="numeric" /></label>
        </div>
        <p className="text-xs text-muted">{isLocated ? "Located on the map: clients searching nearby will find you." : "Add your address so clients searching nearby can find you."}</p>
        <label className="block text-sm font-medium">Salon phone<input className={`${input} mt-1`} value={f.phone} onChange={set("phone")} inputMode="tel" /></label>
        <label className="block text-sm font-medium">About<textarea className={`${input} mt-1`} rows={4} maxLength={1500} value={f.about} onChange={set("about")} placeholder="What you're known for, parking, anything new clients should know." /></label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.listed} onChange={(e) => setF({ ...f, listed: e.target.checked })} />
          <span>Show in search <span className="block text-xs text-muted">Off: only people with your link can find your page and book.</span></span>
        </label>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
        <button
          className="rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background disabled:opacity-50"
          disabled={saving}
          onClick={() => start(async () => {
            const r = await saveSalonProfile(f);
            if (!r.ok) return setMsg({ ok: false, text: r.error });
            setF({ ...f, slug: r.slug });
            setLocated(r.located);
            setMsg({ ok: true, text: r.located ? "Saved." : "Saved, but we couldn't find that address on the map. Check the ZIP." });
          })}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </section>
    </main>
  );
}
