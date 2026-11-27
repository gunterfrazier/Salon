"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import QRCode, { downloadQR } from "@/components/QRCode";
import { SOCIAL_KEYS, SOCIAL_LABEL, type Social } from "@/lib/social";
import { saveLoyalty, savePromo, saveSocial, setPromoActive } from "./actions";
import { DEFAULT_LOYALTY, rewardLabel, type LoyaltySettings, type RewardValue } from "@/lib/promo/loyalty";
import { promoLabel, type Promo } from "@/lib/promo/promo";
import { money } from "@/lib/format";

type PromoRow = Promo & { uses: number; saved: number };

const btn = "rounded-full border border-line px-3 py-1.5 text-sm hover:bg-background";
const input = "w-full rounded-xl border border-line bg-background px-3 py-2.5 text-base";

export default function MarketingView({ salon, pageUrl, shortUrl, bookUrl, googleReview, social, promos = [], services = [], loyalty = DEFAULT_LOYALTY }: { salon: string; pageUrl: string; shortUrl?: string; bookUrl: string; googleReview: string | null; social: Record<string, string>; promos?: PromoRow[]; services?: { id: string; name: string }[]; loyalty?: LoyaltySettings }) {
  const codes = [
    { key: "book", title: "Book online", hint: "Mirror clings, cards, receipts, flyers", url: bookUrl },
    { key: "page", title: "Your salon page", hint: "Instagram and TikTok bio, business cards", url: pageUrl },
    { key: "review", title: googleReview ? "Review us on Google" : "Reviews", hint: googleReview ? "Counter card by the register" : "Add your Google review link in Messages to point here", url: googleReview ?? `${pageUrl}#reviews` },
  ];
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-4">
      <header>
        <h1 className="font-display text-3xl">Marketing</h1>
        <p className="text-sm text-muted">Your links, QR codes and printables. Everything points to your Chairvana page, so clients can book in a tap.</p>
      </header>

      <Link href="/app/marketing/studio" className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-accent">
        <span>
          <span className="block font-semibold">Graphics studio</span>
          <span className="block text-sm text-muted">Instagram and Facebook posts, stories and your Chair Wrapped year recap, made from your photos and colors.</span>
        </span>
        <span aria-hidden="true" className="text-2xl text-muted">›</span>
      </Link>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Your links</h2>
        <CopyRow label="Booking link (for your bio)" url={bookUrl} />
        <CopyRow label="Salon page" url={pageUrl} />
        {shortUrl && <CopyRow label="Short link (easy to say or print)" url={shortUrl} />}
        <p className="text-xs text-muted">Instagram and TikTok: put the booking link in your bio. Facebook: add it as your Book button&rsquo;s website link.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">QR codes</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {codes.map((c) => (
            <article key={c.key} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-center">
              <div className="rounded-xl bg-white p-3">
                <QRCode text={c.url} className="size-32" label={`QR code: ${c.title}`} />
              </div>
              <p className="font-semibold">{c.title}</p>
              <p className="text-xs text-muted">{c.hint}</p>
              <button className={btn} onClick={() => downloadQR(c.url, `${salon.replace(/\W+/g, "-").toLowerCase()}-${c.key}-qr.png`)}>Download PNG</button>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Print</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["cling", "Mirror cling", "“Love the look? Book your next visit before you leave the chair.” 4×4 in, for station mirrors."],
            ["counter", "Counter card", "5×7 in card for the front desk: book, review, follow."],
            ["cards", "Business cards", "Sheet of 10 standard cards (3.5×2 in) with your booking QR."],
          ].map(([k, t, d]) => (
            <Link key={k} href={`/app/marketing/print?kind=${k}`} target="_blank" className="rounded-2xl border border-line bg-surface p-4 hover:border-foreground">
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
              <p className="mt-2 text-sm underline">Open to print</p>
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted">Print on white card stock, or on clear vinyl/static-cling sheets for mirrors. Use &ldquo;Actual size&rdquo; in the print settings.</p>
      </section>

      <Promos promos={promos} services={services} bookUrl={bookUrl} />

      <LoyaltyForm initial={loyalty} />

      <SocialForm social={social} />
    </main>
  );
}

function CopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl bg-background px-3 py-2 text-sm">{url.replace(/^https:\/\//, "")}</code>
        <button
          className={btn}
          onClick={async () => {
            try {
              if (navigator.share && /Mobi/.test(navigator.userAgent)) await navigator.share({ url });
              else {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            } catch {}
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function SocialForm({ social }: { social: Social }) {
  const [v, setV] = useState<Social>(social);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Social links</h2>
      <p className="text-sm text-muted">Shown on your salon page. A handle like @intensitysalon is fine.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SOCIAL_KEYS.map((k) => (
          <label key={k} className="text-sm font-medium">
            {SOCIAL_LABEL[k]}
            <input className={`${input} mt-1`} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={k === "website" ? "intensitysalon.com" : "@yoursalon"} />
          </label>
        ))}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
      <button
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveSocial(v);
            setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? "Saving…" : "Save links"}
      </button>
    </section>
  );
}

function Promos({ promos, services, bookUrl }: { promos: PromoRow[]; services: { id: string; name: string }[]; bookUrl: string }) {
  const [editing, setEditing] = useState<PromoRow | "new" | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Promo codes</h2>
        {!editing && <button className={btn} onClick={() => setEditing("new")}>+ New code</button>}
      </div>
      <p className="text-sm text-muted">Clients type the code when booking online, or you apply it at checkout.</p>
      {editing && <PromoForm p={editing === "new" ? null : editing} services={services} onClose={() => setEditing(null)} />}
      {!promos.length && !editing && <p className="text-sm text-muted">No codes yet. Try NEWCLIENT15 for first visits, or a holiday special.</p>}
      <ul className="divide-y divide-line">
        {promos.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="font-mono font-semibold">{p.code}</span> <span className="text-sm">{promoLabel(p)}{p.serviceIds ? " select services" : ""}</span>
              <span className="block text-xs text-muted">
                {[p.newClientsOnly ? "new clients" : null, p.endsOn ? `until ${p.endsOn}` : null, p.maxUses ? `${p.uses} of ${p.maxUses} used` : `${p.uses} used`, p.saved ? `${money(p.saved)} saved` : null].filter(Boolean).join(" · ")}
                {!p.active ? " · off" : ""}
              </span>
            </span>
            <button className={btn} onClick={() => navigator.clipboard?.writeText(`Use code ${p.code} for ${promoLabel(p)} when you book: ${bookUrl}`)}>Copy post</button>
            <button className={btn} onClick={() => setEditing(p)}>Edit</button>
            <button className={btn} disabled={pending} onClick={() => start(async () => void (await setPromoActive(p.id, !p.active)))}>{p.active ? "Turn off" : "Turn on"}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PromoForm({ p, services, onClose }: { p: PromoRow | null; services: { id: string; name: string }[]; onClose: () => void }) {
  const [f, setF] = useState({
    code: p?.code ?? "",
    description: p?.description ?? "",
    kind: p?.kind ?? "percent",
    value: p ? (p.kind === "percent" ? String(p.value) : (p.value / 100).toFixed(2)) : "15",
    serviceIds: p?.serviceIds ?? ([] as string[]),
    newClientsOnly: p?.newClientsOnly ?? false,
    minSpend: p ? (p.minSpendCents / 100).toFixed(0) : "0",
    startsOn: p?.startsOn ?? "",
    endsOn: p?.endsOn ?? "",
    maxUses: p?.maxUses ? String(p.maxUses) : "",
    perClient: String(p?.perClient ?? 1),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const l = "text-sm font-medium";
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={l}>Code<input className={`${input} mt-1 font-mono uppercase`} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="FALL20" /></label>
        <label className={l}>
          Discount
          <div className="mt-1 flex gap-2">
            <select className={`${input} w-28`} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "percent" | "amount" })} aria-label="Kind">
              <option value="percent">% off</option>
              <option value="amount">$ off</option>
            </select>
            <input className={input} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} aria-label="Amount" />
          </div>
        </label>
        <label className={`${l} sm:col-span-2`}>Short description (optional, shown to clients)<input className={`${input} mt-1`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="15% off your first visit" /></label>
        <label className={l}>Starts (optional)<input type="date" className={`${input} mt-1`} value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></label>
        <label className={l}>Ends (optional)<input type="date" className={`${input} mt-1`} value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></label>
        <label className={l}>Total uses (empty = unlimited)<input className={`${input} mt-1`} inputMode="numeric" value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} /></label>
        <label className={l}>Uses per client<input className={`${input} mt-1`} inputMode="numeric" value={f.perClient} onChange={(e) => setF({ ...f, perClient: e.target.value })} /></label>
        <label className={l}>Minimum total ($)<input className={`${input} mt-1`} inputMode="decimal" value={f.minSpend} onChange={(e) => setF({ ...f, minSpend: e.target.value })} /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="size-5" checked={f.newClientsOnly} onChange={(e) => setF({ ...f, newClientsOnly: e.target.checked })} /> New clients only</label>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Only for some services {f.serviceIds.length ? `(${f.serviceIds.length})` : "(all services)"}</summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {services.map((sv) => {
            const on = f.serviceIds.includes(sv.id);
            return (
              <button key={sv.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, serviceIds: on ? f.serviceIds.filter((x) => x !== sv.id) : [...f.serviceIds, sv.id] })} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-foreground bg-foreground text-background" : "border-line"}`}>
                {sv.name}
              </button>
            );
          })}
        </div>
      </details>
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background disabled:opacity-50"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await savePromo(p?.id ?? null, { ...f, active: p ? p.active : true });
              if (r.ok) onClose();
              else setError(r.error);
            })
          }
        >
          {pending ? "Saving…" : "Save code"}
        </button>
        <button className={btn} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function RewardInput({ value, onChange, label }: { value: RewardValue; onChange: (v: RewardValue) => void; label: string }) {
  return (
    <label className="text-sm font-medium">
      {label}
      <div className="mt-1 flex gap-2">
        <select className={`${input} w-24`} value={value.kind} onChange={(e) => onChange({ kind: e.target.value as RewardValue["kind"], value: e.target.value === "percent" ? 10 : 1000 })} aria-label={`${label}: kind`}>
          <option value="amount">$ off</option>
          <option value="percent">% off</option>
        </select>
        <input className={input} inputMode="decimal" aria-label={`${label}: amount`} value={value.kind === "amount" ? String(value.value / 100) : String(value.value)} onChange={(e) => onChange({ ...value, value: value.kind === "amount" ? Math.round(Number(e.target.value || 0) * 100) : Math.round(Number(e.target.value || 0)) })} />
      </div>
    </label>
  );
}

function LoyaltyForm({ initial }: { initial: LoyaltySettings }) {
  const [s, setS] = useState<LoyaltySettings>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Loyalty &amp; referrals</h2>
      <div className="space-y-3 rounded-xl border border-line p-3">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" className="size-5" checked={s.card.enabled} onChange={(e) => setS({ ...s, card: { ...s.card, enabled: e.target.checked } })} /> Punch card
        </label>
        {s.card.enabled && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Every
              <div className="mt-1 flex items-center gap-2">
                <input className={`${input} w-20`} inputMode="numeric" value={s.card.visits} onChange={(e) => setS({ ...s, card: { ...s.card, visits: Number(e.target.value) || 0 } })} aria-label="Visits" />
                <span>paid visits</span>
              </div>
            </label>
            <RewardInput label="Reward" value={s.card.reward} onChange={(v) => setS({ ...s, card: { ...s.card, reward: v } })} />
            <p className="text-xs text-muted sm:col-span-2">Clients see their card on their home page. The reward is offered at checkout after their {s.card.visits}th visit: {rewardLabel(s.card.reward)}.</p>
          </div>
        )}
      </div>
      <div className="space-y-3 rounded-xl border border-line p-3">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" className="size-5" checked={s.referral.enabled} onChange={(e) => setS({ ...s, referral: { ...s.referral, enabled: e.target.checked } })} /> Referrals
        </label>
        {s.referral.enabled && (
          <div className="grid gap-2 sm:grid-cols-2">
            <RewardInput label="New friend gets" value={s.referral.friend} onChange={(v) => setS({ ...s, referral: { ...s.referral, friend: v } })} />
            <RewardInput label="Client who referred gets" value={s.referral.referrer} onChange={(v) => setS({ ...s, referral: { ...s.referral, referrer: v } })} />
            <p className="text-xs text-muted sm:col-span-2">Every client gets a personal booking link on their home page. The friend&rsquo;s reward is offered at their first checkout; the referrer&rsquo;s after that first visit.</p>
          </div>
        )}
      </div>
      <label className="block text-sm font-medium">
        Rewards expire
        <select className={`${input} mt-1 sm:w-60`} value={s.expireMonths ?? ""} onChange={(e) => setS({ ...s, expireMonths: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Never</option>
          {[3, 6, 12, 24].map((m) => <option key={m} value={m}>After {m} months</option>)}
        </select>
      </label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
      <button
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveLoyalty(s);
            setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
