"use client";

import { useEffect, useState, useTransition } from "react";
import { checkoutTotals, tipPresets } from "@/lib/checkout/settle";
import type { CalAppointment, CalendarData } from "@/lib/data/calendar-types";
import { money } from "@/lib/format";
import { checkoutAppointment, sellableProducts } from "./actions";
import { Row, Sheet, toCents } from "./CloseSheet";

const input = "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base";

export default function CheckoutSheet({ a, data, onClose, onDone }: { a: CalAppointment; data: CalendarData; onClose: () => void; onDone: () => void }) {
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(a.services.map((s) => [s.id, (s.finalPrice / 100).toFixed(2)])));
  const [tip, setTip] = useState("0");
  const [paid, setPaid] = useState<string | null>(null);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof sellableProducts>>>([]);
  const [retail, setRetail] = useState<{ productId: string; qty: string; price: string }[]>([]);
  useEffect(() => {
    sellableProducts().then(setCatalog).catch(() => setCatalog([]));
  }, []);
  const retailCents = retail.reduce((n, r) => n + Math.round(Number(r.qty || 0) * toCents(r.price || "0")), 0);

  const priceCents = a.services.map((s) => toCents(prices[s.id] ?? ""));
  const tipCents = toCents(tip || "0");
  const services = priceCents.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);
  const dueEstimate = Math.max(0, services + (Number.isFinite(retailCents) ? retailCents : 0) + (Number.isFinite(tipCents) ? tipCents : 0) - a.depositPaid);
  const paidCents = paid === null ? dueEstimate : toCents(paid || "0");

  let totals: ReturnType<typeof checkoutTotals> | null = null;
  let problem: string | null = null;
  try {
    if ([...priceCents, tipCents, paidCents, retailCents].some((n) => !Number.isFinite(n))) throw new Error("Enter every amount.");
    if (retail.some((r) => !r.productId || !(Number(r.qty) > 0))) throw new Error("Pick each product and how many.");
    totals = checkoutTotals({ prices: priceCents, retail: retailCents, tip: tipCents, depositPaid: a.depositPaid, paid: paidCents });
  } catch (e) {
    problem = (e as Error).message;
  }

  function confirm() {
    if (!totals) return;
    setError(null);
    start(async () => {
      const res = await checkoutAppointment({
        appointmentId: a.id,
        prices: a.services.map((s, i) => ({ id: s.id, cents: priceCents[i] })),
        retail: retail.map((r) => ({ productId: r.productId, qty: Number(r.qty), priceCents: toCents(r.price || "0") })),
        tipCents,
        paidCents,
        method,
        reference,
      });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  return (
    <Sheet
      title={`Check out: ${a.clientName}`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">{error ?? problem}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2.5">Back</button>
            <button onClick={confirm} disabled={!totals || saving} className="rounded-lg bg-accent px-4 py-2.5 font-semibold text-on-accent disabled:opacity-40">
              {saving ? "Saving…" : totals && totals.paid > 0 ? `Record ${money(totals.paid)}` : "Complete visit"}
            </button>
          </div>
        </div>
      }
    >
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Services</h3>
        {a.services.map((s) => (
          <label key={s.id} className="flex items-center justify-between gap-3">
            <span>
              {s.name}
              {s.priceType === "starting_at" && <span className="block text-xs text-muted">Price varies: adjust if needed</span>}
              {s.discounts.map((d, j) => <span key={j} className="block text-xs text-muted">{d.label} applied</span>)}
            </span>
            <span className="flex items-center gap-1">
              $<input type="number" inputMode="decimal" step="0.01" min={0} value={prices[s.id]} onChange={(e) => setPrices({ ...prices, [s.id]: e.target.value })} className="w-28 rounded-lg border border-line bg-background px-2 py-1.5 text-right tabular-nums" aria-label={`${s.name} price`} />
            </span>
          </label>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Retail</h3>
        {retail.map((r, i) => {
          const p = catalog.find((x) => x.id === r.productId);
          return (
            <div key={i} className="space-y-1 rounded-lg border border-line p-2">
              <select
                className={input}
                value={r.productId}
                aria-label="Product"
                onChange={(e) => {
                  const pick = catalog.find((x) => x.id === e.target.value);
                  setRetail(retail.map((x, j) => (j === i ? { ...x, productId: e.target.value, price: pick?.priceCents != null ? (pick.priceCents / 100).toFixed(2) : x.price } : x)));
                }}
              >
                <option value="">Pick a product…</option>
                {catalog.map((x) => <option key={x.id} value={x.id}>{x.label}{x.priceCents != null ? ` · ${money(x.priceCents)}` : ""}</option>)}
              </select>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-1">Qty <input type="number" inputMode="numeric" min={1} step={1} value={r.qty} onChange={(e) => setRetail(retail.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="w-16 rounded-lg border border-line bg-background px-2 py-1.5 text-right" aria-label="Quantity" /></label>
                <label className="flex items-center gap-1">$<input type="number" inputMode="decimal" step="0.01" min={0} value={r.price} onChange={(e) => setRetail(retail.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} className="w-24 rounded-lg border border-line bg-background px-2 py-1.5 text-right" aria-label="Price each" /></label>
                {p && p.onHand < Number(r.qty || 0) && <span className="text-xs text-muted">Only {p.onHand} in stock</span>}
                <button type="button" className="ml-auto text-xs underline" onClick={() => setRetail(retail.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </div>
          );
        })}
        {catalog.length > 0 ? (
          <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm" onClick={() => setRetail([...retail, { productId: "", qty: "1", price: "" }])}>+ Add product</button>
        ) : (
          <p className="text-xs text-muted">Add retail products (with a price) in Inventory to sell them here.</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Tip</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setTip("0")} className={`rounded-full border px-3 py-1.5 text-sm ${tipCents === 0 ? "border-accent bg-accent text-on-accent" : "border-line"}`}>None</button>
          {tipPresets(services).map((t) => (
            <button key={t.percent} type="button" onClick={() => setTip((t.amount / 100).toFixed(2))} className={`rounded-full border px-3 py-1.5 text-sm ${tipCents === t.amount && t.amount > 0 ? "border-accent bg-accent text-on-accent" : "border-line"}`}>
              {t.percent}% <span className="opacity-75">{money(t.amount)}</span>
            </button>
          ))}
          <span className="ml-1 flex items-center gap-1">
            $<input type="number" inputMode="decimal" step="0.01" min={0} value={tip} onChange={(e) => setTip(e.target.value)} className="w-24 rounded-lg border border-line bg-background px-2 py-1.5 text-right" aria-label="Tip amount" />
          </span>
        </div>
      </section>

      {totals && (
        <section className="space-y-1 rounded-xl border border-line p-3 text-sm">
          <Row label="Services" value={money(totals.services)} />
          {totals.retail > 0 && <Row label="Retail" value={money(totals.retail)} />}
          {totals.tip > 0 && <Row label="Tip" value={money(totals.tip)} />}
          {totals.depositApplied > 0 && <Row label="Deposit already paid" value={`−${money(totals.depositApplied)}`} />}
          <Row label="Due now" value={money(totals.due)} bold />
          {totals.refund > 0 && <Row label="Deposit to return to client" value={money(totals.refund)} />}
        </section>
      )}

      {(totals?.due ?? 1) > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Payment</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={input} aria-label="Payment method">
              {data.paymentMethods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <label className="flex items-center gap-1">
              $<input type="number" inputMode="decimal" step="0.01" min={0} value={paid ?? (dueEstimate / 100).toFixed(2)} onChange={(e) => setPaid(e.target.value)} className={input} aria-label="Amount paid" />
            </label>
          </div>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={input} placeholder="Reference, e.g. Venmo note (optional)" aria-label="Reference" />
          {totals && totals.balance > 0 && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {money(totals.balance)} will be added to the client&rsquo;s balance.
            </p>
          )}
        </section>
      )}
    </Sheet>
  );
}
