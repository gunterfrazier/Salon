"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { joinOnline } from "./actions";

const input = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base";

export default function JoinLine({ slug, services, stylists }: { slug: string; services: { id: string; name: string }[]; stylists: { id: string; name: string; wait: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", phone: "", serviceIds: [] as string[], requested: "", website: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3 rounded-2xl border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await joinOnline({ slug, ...f, requested: f.requested || null });
          if (r.ok) router.push(`/w/${r.token}`);
          else setError(r.error);
        });
      }}
    >
      <h2 className="font-semibold">Join the line</h2>
      <label className="block text-sm font-medium">Your name<input className={input} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
      <label className="block text-sm font-medium">Mobile<input className={input} required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></label>
      {services.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">What for? (optional)</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {services.map((s) => {
              const on = f.serviceIds.includes(s.id);
              return <button key={s.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, serviceIds: on ? f.serviceIds.filter((x) => x !== s.id) : [...f.serviceIds, s.id] })} className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line"}`}>{s.name}</button>;
            })}
          </div>
        </fieldset>
      )}
      {stylists.length > 1 && (
        <label className="block text-sm font-medium">
          With
          <select className={input} value={f.requested} onChange={(e) => setF({ ...f, requested: e.target.value })}>
            <option value="">Anyone (shortest wait)</option>
            {stylists.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.wait})</option>)}
          </select>
        </label>
      )}
      <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <button className="w-full rounded-full bg-accent py-3 font-semibold text-on-accent disabled:opacity-50" disabled={pending}>{pending ? "Joining…" : "Join the line"}</button>
      <p className="text-xs text-muted">You&rsquo;ll get a page showing your place and wait. Head over when you&rsquo;re close to the front.</p>
    </form>
  );
}
