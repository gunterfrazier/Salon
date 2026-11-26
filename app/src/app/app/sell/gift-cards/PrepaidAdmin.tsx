"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { money } from "@/lib/format";
import { savePackageTemplate, voidGiftCard } from "../actions";

type Card = { id: string; code: string; initialCents: number; balanceCents: number; recipient: string | null; buyer: string | null; status: string; expiresOn: string | null; createdAt: string };
type Tpl = { id: string; name: string; serviceId: string; visits: number; priceCents: number; expireMonths: number | null; active: boolean };
type Pkg = { id: string; clientId: string; client: string; name: string; used: number; total: number; expiresOn: string | null; createdAt: string };

const input = "w-full rounded-lg border border-line bg-background px-3 py-2 text-base";
const btn = "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50";
const fmtCode = (c: string) => c.replace(/(.{4})/, "$1-");

export default function PrepaidAdmin({ cards, templates, packages, services, can, tz }: { cards: Card[]; templates: Tpl[]; packages: Pkg[]; services: { id: string; name: string }[]; can: { templates: boolean; void: boolean }; tz: string }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Tpl | null>(null);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });
  const shown = cards.filter((c) => !q.trim() || `${c.code} ${c.recipient ?? ""} ${c.buyer ?? ""}`.toLowerCase().includes(q.trim().toLowerCase().replace(/-/g, "")));
  const outstanding = cards.filter((c) => c.status === "active").reduce((n, c) => n + c.balanceCents, 0);
  const svcName = (id: string) => services.find((s) => s.id === id)?.name ?? "Service";

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-4">
      <Link href="/app/sell" className="text-sm text-muted hover:underline">‹ Sell</Link>
      <h1 className="text-2xl font-bold">Gift cards &amp; packages</h1>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Gift cards</h2>
          <p className="text-sm text-muted">Unspent balances: {money(outstanding)}</p>
        </div>
        <input className={input} placeholder="Find by code or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a gift card" />
        {!shown.length && <p className="text-sm text-muted">{cards.length ? "No matches." : "No gift cards sold yet. Sell one from Sell → Gift card."}</p>}
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {shown.slice(0, 100).map((c) => <CardRow key={c.id} c={c} canVoid={can.void} day={day} />)}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Packages you sell</h2>
        <p className="text-sm text-muted">Prepaid visits for one service, used at checkout. For example “5 blowouts” for the price of 4.</p>
        {templates.map((t) => (
          <article key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3">
            <span>
              <span className="font-semibold">{t.name}</span> <span className="text-sm text-muted">· {t.visits} × {svcName(t.serviceId)} · {money(t.priceCents)}{t.expireMonths ? ` · use within ${t.expireMonths} months` : ""}{t.active ? "" : " · not for sale"}</span>
            </span>
            {can.templates && <button className={btn} onClick={() => setEditing(t)}>Edit</button>}
          </article>
        ))}
        {can.templates && !editing && (
          <button className={btn} onClick={() => setEditing({ id: "", name: "", serviceId: services[0]?.id ?? "", visits: 5, priceCents: 0, expireMonths: 12, active: true })}>+ New package</button>
        )}
        {editing && <TemplateForm t={editing} services={services} onClose={() => setEditing(null)} />}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Clients&rsquo; packages</h2>
        {!packages.length && <p className="text-sm text-muted">None sold yet. Sell one from Sell → Package.</p>}
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {packages.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <Link href={`/app/clients/${p.clientId}`} className="font-medium underline">{p.client}</Link> · {p.name}
              </span>
              <span className="text-muted">
                {p.total - p.used} of {p.total} left · bought {day(p.createdAt)}{p.expiresOn ? ` · expires ${new Date(`${p.expiresOn}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function CardRow({ c, canVoid, day }: { c: Card; canVoid: boolean; day: (iso: string) => string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <span className="min-w-0">
        <span className="font-mono font-semibold tracking-wider">{fmtCode(c.code)}</span>{" "}
        <span className="text-sm text-muted">
          {c.recipient ? `for ${c.recipient} · ` : ""}
          {c.buyer ? `bought by ${c.buyer} · ` : ""}
          {day(c.createdAt)}
        </span>
      </span>
      <span className="flex items-center gap-2 text-sm">
        {c.status === "void" ? <span className="text-muted">Cancelled</span> : <span><strong>{money(c.balanceCents)}</strong> <span className="text-muted">of {money(c.initialCents)}</span></span>}
        <Link href={`/app/sell/gift-cards/${c.id}`} className={btn}>Print</Link>
        {canVoid && c.status === "active" && (
          <button
            className={btn}
            disabled={pending}
            onClick={() => {
              if (!confirm(`Cancel gift card ${fmtCode(c.code)}? Its ${money(c.balanceCents)} balance can't be used after this. Refund the buyer separately if needed.`)) return;
              start(async () => {
                const r = await voidGiftCard(c.id);
                if (!r.ok) setErr(r.error);
              });
            }}
          >
            Cancel
          </button>
        )}
        {err && <span role="alert" className="text-red-700 dark:text-red-300">{err}</span>}
      </span>
    </li>
  );
}

function TemplateForm({ t, services, onClose }: { t: Tpl; services: { id: string; name: string }[]; onClose: () => void }) {
  const [name, setName] = useState(t.name);
  const [serviceId, setServiceId] = useState(t.serviceId);
  const [visits, setVisits] = useState(String(t.visits));
  const [price, setPrice] = useState(t.priceCents ? (t.priceCents / 100).toFixed(2) : "");
  const [expire, setExpire] = useState<string>(t.expireMonths ? String(t.expireMonths) : "");
  const [active, setActive] = useState(t.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <h3 className="font-semibold">{t.id ? "Edit package" : "New package"}</h3>
      <label className="block text-sm font-medium">
        Name
        <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="5 blowouts" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Service
          <select className={`${input} mt-1`} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Visits included
          <input type="number" min={1} max={100} className={`${input} mt-1`} value={visits} onChange={(e) => setVisits(e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Price for the package
          <input type="number" inputMode="decimal" min={0} step="0.01" className={`${input} mt-1`} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </label>
        <label className="text-sm font-medium">
          Use within
          <select className={`${input} mt-1`} value={expire} onChange={(e) => setExpire(e.target.value)}>
            <option value="">No expiry</option>
            {[3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} months</option>)}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> For sale
      </label>
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await savePackageTemplate({ id: t.id || null, name, serviceId, visits: Number(visits), priceCents: Math.round(Number(price || "0") * 100), expireMonths: expire ? Number(expire) : null, active });
              if (r.ok) onClose();
              else setError(r.error);
            })
          }
        >
          {pending ? "Saving…" : "Save package"}
        </button>
        <button className={btn} onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
