"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import QRCode, { downloadQR } from "@/components/QRCode";
import { SOCIAL_KEYS, SOCIAL_LABEL, type Social } from "@/lib/social";
import { saveSocial } from "./actions";

const btn = "rounded-full border border-line px-3 py-1.5 text-sm hover:bg-background";
const input = "w-full rounded-xl border border-line bg-background px-3 py-2.5 text-base";

export default function MarketingView({ salon, pageUrl, bookUrl, googleReview, social }: { salon: string; pageUrl: string; bookUrl: string; googleReview: string | null; social: Record<string, string> }) {
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

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Your links</h2>
        <CopyRow label="Booking link (for your bio)" url={bookUrl} />
        <CopyRow label="Salon page" url={pageUrl} />
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
