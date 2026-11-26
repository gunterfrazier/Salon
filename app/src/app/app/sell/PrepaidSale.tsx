"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { money } from "@/lib/format";
import { sellGiftCard, sellPackage } from "./actions";

export interface SellTemplate {
  id: string;
  name: string;
  serviceName: string;
  visits: number;
  priceCents: number;
  expireMonths: number | null;
}

type Client = { id: string; name: string; phone: string | null };
type Method = { key: string; label: string };

const input = "w-full rounded-lg border border-line bg-background px-3 py-2 text-base";
const toCents = (s: string) => (s.trim() === "" ? NaN : Math.round(Number(s) * 100));

function ClientPicker({ clients, value, onChange, label }: { clients: Client[]; value: Client | null; onChange: (c: Client | null) => void; label: string }) {
  const [q, setQ] = useState("");
  const matches = q.trim() && !value ? clients.filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      {value ? (
        <p className="mt-1 text-sm">
          {value.name} <button type="button" className="underline" onClick={() => onChange(null)}>Change</button>
        </p>
      ) : (
        <>
          <input className={`${input} mt-1`} placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label={label} />
          {matches.length > 0 && (
            <ul className="mt-1 rounded-lg border border-line">
              {matches.map((c) => (
                <li key={c.id}>
                  <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-background" onClick={() => onChange(c)}>
                    {c.name} <span className="text-muted">{c.phone ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Payment({ methods, method, setMethod, reference, setReference }: { methods: Method[]; method: string; setMethod: (m: string) => void; reference: string; setReference: (r: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select className={input} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
        {methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
      <input className={input} placeholder="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Reference" />
    </div>
  );
}

const PRESETS = [25, 50, 75, 100];

export function GiftCardSaleForm({ clients, methods }: { clients: Client[]; methods: Method[] }) {
  const [amount, setAmount] = useState("50");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [buyer, setBuyer] = useState<Client | null>(null);
  const [method, setMethod] = useState(methods[0]?.key ?? "cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sold, setSold] = useState<{ id: string; code: string; cents: number } | null>(null);
  const [pending, start] = useTransition();
  const cents = toCents(amount);

  if (sold) {
    return (
      <section className="space-y-3 rounded-xl border border-line bg-surface p-4 text-center" role="status">
        <p className="text-sm text-muted">Gift card sold: {money(sold.cents)}</p>
        <p className="font-mono text-3xl font-bold tracking-widest">{sold.code.replace(/(.{4})/, "$1-")}</p>
        <p className="text-sm">Give this code to the recipient. They can use it at checkout.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/app/sell/gift-cards/${sold.id}`} className="rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent">Print the gift card</Link>
          <button className="rounded-lg border border-line px-4 py-2" onClick={() => setSold(null)}>Sell another</button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <p className="text-sm font-semibold">Amount</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setAmount(String(p))} className={`rounded-full border px-4 py-1.5 text-sm ${cents === p * 100 ? "border-accent bg-accent text-on-accent" : "border-line"}`}>
              ${p}
            </button>
          ))}
          <label className="flex items-center gap-1">
            $<input type="number" inputMode="decimal" min={1} max={1000} step="1" className="w-24 rounded-lg border border-line bg-background px-2 py-1.5 text-right" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Gift card amount" />
          </label>
        </div>
      </div>
      <label className="block text-sm font-semibold">
        For (recipient, optional)
        <input className={`${input} mt-1 font-normal`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="e.g. Mia" />
      </label>
      <label className="block text-sm font-semibold">
        Message (optional, printed on the card)
        <input className={`${input} mt-1 font-normal`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Happy birthday!" />
      </label>
      <ClientPicker clients={clients} value={buyer} onChange={setBuyer} label="Bought by (optional client)" />
      <Payment methods={methods} method={method} setMethod={setMethod} reference={reference} setReference={setReference} />
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <button
        disabled={pending || !(cents >= 100)}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await sellGiftCard({ amountCents: cents, recipientName: to, message, clientId: buyer?.id ?? null, method, reference });
            if (r.ok) setSold({ id: r.id, code: r.code, cents });
            else setError(r.error);
          })
        }
        className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-on-accent disabled:opacity-40"
      >
        {pending ? "Saving…" : `Sell ${Number.isFinite(cents) ? money(cents) : ""} gift card`}
      </button>
    </section>
  );
}

export function PackageSaleForm({ clients, methods, templates }: { clients: Client[]; methods: Method[]; templates: SellTemplate[] }) {
  const [pick, setPick] = useState(templates[0]?.id ?? "");
  const [client, setClient] = useState<Client | null>(null);
  const [method, setMethod] = useState(methods[0]?.key ?? "cash");
  const [reference, setReference] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const t = templates.find((x) => x.id === pick);

  if (!templates.length) {
    return (
      <p className="rounded-xl border border-line bg-surface p-4 text-sm">
        No packages yet. Set them up under <Link href="/app/sell/gift-cards" className="underline">Gift cards &amp; packages</Link>, e.g. “5 blowouts for the price of 4”.
      </p>
    );
  }
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <label className="block text-sm font-semibold">
        Package
        <select className={`${input} mt-1 font-normal`} value={pick} onChange={(e) => setPick(e.target.value)}>
          {templates.map((x) => <option key={x.id} value={x.id}>{x.name} · {money(x.priceCents)}</option>)}
        </select>
      </label>
      {t && (
        <p className="text-sm text-muted">
          {t.visits} × {t.serviceName}
          {t.expireMonths ? ` · use within ${t.expireMonths} months` : ""}
        </p>
      )}
      <ClientPicker clients={clients} value={client} onChange={setClient} label="Client" />
      <Payment methods={methods} method={method} setMethod={setMethod} reference={reference} setReference={setReference} />
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "" : "text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
      <button
        disabled={pending || !client || !t}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await sellPackage({ clientId: client!.id, templateId: pick, method, reference });
            if (r.ok) {
              setMsg({ ok: true, text: `${t!.name} sold to ${client!.name}. Use a visit at checkout.` });
              setClient(null);
              setReference("");
            } else setMsg({ ok: false, text: r.error });
          })
        }
        className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-on-accent disabled:opacity-40"
      >
        {pending ? "Saving…" : t ? `Sell ${t.name} · ${money(t.priceCents)}` : "Sell package"}
      </button>
    </section>
  );
}
