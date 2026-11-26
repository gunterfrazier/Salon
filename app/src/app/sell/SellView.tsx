"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import BarcodeScanner from "@/app/inventory/BarcodeScanner";
import { money } from "@/lib/format";
import { quickSale } from "./actions";

interface P {
  id: string;
  label: string;
  priceCents: number | null;
  onHand: number;
  barcode: string | null;
  retail: boolean;
}
interface Line {
  productId: string;
  qty: number;
  price: string;
}

const input = "rounded-lg border border-line bg-background px-3 py-2 text-base";
const toCents = (s: string) => (s.trim() === "" ? NaN : Math.round(Number(s) * 100));

/** Quick retail sale: pick or scan products, optional client, payment method. */
export default function SellView({ products, clients, methods }: { products: P[]; clients: { id: string; name: string; phone: string | null }[]; methods: { key: string; label: string }[] }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [clientQ, setClientQ] = useState("");
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [method, setMethod] = useState(methods[0]?.key ?? "cash");
  const [reference, setReference] = useState("");
  const [scan, setScan] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; saleId?: string } | null>(null);
  const [saving, start] = useTransition();

  const add = (p: P) => {
    setMsg(null);
    setLines((ls) => {
      const hit = ls.find((l) => l.productId === p.id);
      if (hit) return ls.map((l) => (l === hit ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { productId: p.id, qty: 1, price: p.priceCents === null ? "" : (p.priceCents / 100).toFixed(2) }];
    });
    setSearch("");
  };
  const total = lines.reduce((n, l) => n + l.qty * toCents(l.price || "0"), 0);
  const valid = lines.length > 0 && lines.every((l) => l.qty > 0 && Number.isFinite(toCents(l.price)));
  const matches = search.trim() ? products.filter((p) => p.label.toLowerCase().includes(search.toLowerCase())).slice(0, 8) : [];
  const clientMatches = clientQ.trim() && !client ? clients.filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(clientQ.toLowerCase())).slice(0, 6) : [];

  const save = () =>
    start(async () => {
      const r = await quickSale({ clientId: client?.id ?? null, items: lines.map((l) => ({ productId: l.productId, qty: l.qty, priceCents: toCents(l.price) })), method, reference });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: `Sale recorded: ${money(total)}.`, saleId: r.saleId });
      setLines([]);
      setClient(null);
      setClientQ("");
      setReference("");
    });

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Sell</h1>
        <p className="text-sm text-muted">Retail without an appointment. To add products to a visit, use Check out on the calendar.</p>
      </div>

      {msg?.ok && (
        <p role="status" className="rounded-xl border border-line bg-surface p-3 text-sm">
          {msg.text}{" "}
          {msg.saleId && (
            <Link className="underline" href={`/receipt?sale=${msg.saleId}`}>
              Print receipt
            </Link>
          )}
        </p>
      )}

      {products.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm">
          No retail products yet. Add them in <Link href="/inventory" className="underline">Inventory</Link> with a retail price.
        </p>
      ) : (
        <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <div className="flex gap-2">
            <input className={`${input} min-w-0 flex-1`} placeholder="Find a product…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a product" />
            <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm" onClick={() => setScan(true)}>Scan</button>
          </div>
          {matches.length > 0 && (
            <ul className="rounded-lg border border-line">
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-background" onClick={() => add(p)}>
                    <span>{p.label}</span>
                    <span className="text-muted">{p.priceCents !== null ? money(p.priceCents) : "no price"} · {p.onHand} in stock</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lines.map((l, i) => {
            const p = products.find((x) => x.id === l.productId)!;
            return (
              <div key={l.productId} className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-sm">
                <span className="min-w-0 basis-full font-medium sm:basis-0 sm:flex-1">{p.label}</span>
                <button type="button" className="rounded-lg border border-line px-3 py-1" aria-label="One less" onClick={() => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>−</button>
                <span className="w-6 text-center tabular-nums" aria-label="Quantity">{l.qty}</span>
                <button type="button" className="rounded-lg border border-line px-3 py-1" aria-label="One more" onClick={() => setLines(lines.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))}>+</button>
                <label className="flex items-center gap-1">$<input type="number" inputMode="decimal" step="0.01" min={0} className="w-24 rounded-lg border border-line bg-background px-2 py-1 text-right" value={l.price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} aria-label="Price each" /></label>
                <button type="button" className="text-xs underline" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>
              </div>
            );
          })}
        </section>
      )}

      {lines.length > 0 && (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <label className="text-sm font-semibold" htmlFor="sale-client">Client (optional)</label>
            {client ? (
              <p className="mt-1 text-sm">
                {client.name}{" "}
                <button type="button" className="underline" onClick={() => setClient(null)}>Change</button>
              </p>
            ) : (
              <>
                <input id="sale-client" className={`${input} mt-1 w-full`} placeholder="Walk-in, or search by name or phone" value={clientQ} onChange={(e) => setClientQ(e.target.value)} />
                {clientMatches.length > 0 && (
                  <ul className="mt-1 rounded-lg border border-line">
                    {clientMatches.map((c) => (
                      <li key={c.id}>
                        <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-background" onClick={() => setClient({ id: c.id, name: c.name })}>
                          {c.name} <span className="text-muted">{c.phone ?? ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select className={input} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
              {methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <input className={input} placeholder="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Reference" />
          </div>
          {msg && !msg.ok && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{msg.text}</p>}
          <button type="button" disabled={!valid || saving} onClick={save} className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-on-accent disabled:opacity-40">
            {saving ? "Saving…" : `Record ${Number.isFinite(total) ? money(total) : ""} sale`}
          </button>
        </section>
      )}

      {scan && (
        <BarcodeScanner
          onClose={() => setScan(false)}
          onCode={(code) => {
            setScan(false);
            const p = products.find((x) => x.barcode === code);
            if (p) add(p);
            else setMsg({ ok: false, text: `No product with barcode ${code}. Add it in Inventory first.` });
          }}
        />
      )}
      {msg && !msg.ok && lines.length === 0 && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{msg.text}</p>}
    </main>
  );
}
