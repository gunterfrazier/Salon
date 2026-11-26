"use client";

import { useMemo, useState, useTransition } from "react";
import { money } from "@/lib/format";
import { catalogLines, lineTitle, qty, reorderList, shortBrand, stockLevel, TYPE_LABEL, VENDOR_LABEL, type CatalogLine, type Product, type Unit, type Vendor } from "@/lib/inventory/stock";
import { addFromCatalog, archiveProduct, changeStock, saveProduct, type ProductFields } from "./actions";
import BarcodeScanner from "./BarcodeScanner";

type Tab = "stock" | "reorder" | "add";
const input = "rounded-lg border border-line bg-background px-2.5 py-2 text-sm";
const btn = "rounded-lg border border-line px-3 py-2 text-sm hover:bg-background disabled:opacity-50";
const primary = "rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50";
const KINDS = [
  ["color", "Color"], ["developer", "Developer"], ["lightener", "Lightener"], ["treatment", "Treatment"], ["care", "Back bar / care"], ["retail", "Retail"], ["supply", "Supplies"],
] as const;

function Level({ p }: { p: Product }) {
  const l = stockLevel(p);
  if (l === "out") return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">Out</span>;
  if (l === "low") return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Low</span>;
  return null;
}

export default function InventoryView({ products }: { products: Product[] }) {
  const [tab, setTab] = useState<Tab>(products.length ? "stock" : "add");
  const reorder = useMemo(() => reorderList(products), [products]);
  const lowCount = reorder.reduce((n, g) => n + g.lines.length, 0);

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="text-sm text-muted">Counts are in tubes/bottles/jars: 0.5 = half a tube.</p>
      </div>
      <nav aria-label="Inventory" className="flex gap-2">
        {(
          [
            ["stock", `Stock (${products.length})`],
            ["reorder", `Reorder${lowCount ? ` (${lowCount})` : ""}`],
            ["add", "Add products"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`rounded-lg px-3 py-2 text-sm ${tab === k ? "bg-foreground font-semibold text-background" : "border border-line"}`}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "stock" && <StockTab products={products} onAdd={() => setTab("add")} />}
      {tab === "reorder" && <ReorderTab groups={reorder} />}
      {tab === "add" && <AddTab onDone={() => setTab("stock")} />}
    </main>
  );
}

// --- Stock ------------------------------------------------------------------

function StockTab({ products, onAdd }: { products: Product[]; onAdd: () => void }) {
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [kind, setKind] = useState("");
  const [sheet, setSheet] = useState<{ p: Product; mode: "count" | "received" | "edit" } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [newBarcode, setNewBarcode] = useState<string | null>(null);

  const list = products.filter((p) => {
    if (kind && p.kind !== kind) return false;
    if (lowOnly && !["low", "out"].includes(stockLevel(p))) return false;
    if (!q.trim()) return true;
    const hay = `${p.brand} ${p.line ?? ""} ${p.shade ?? ""} ${p.name} ${p.barcode ?? ""}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });
  const groups = new Map<string, Product[]>();
  for (const p of list) {
    const k = lineTitle(p);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }

  if (!products.length) {
    return (
      <p className="rounded-xl border border-line bg-surface p-4 text-sm">
        No products yet.{" "}
        <button className="underline" onClick={onAdd}>
          Add your color lines from the catalog
        </button>{" "}
        to get started.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} min-w-0 flex-1`} placeholder="Search: 6N, Shades EQ, developer…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        <select className={input} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {KINDS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="h-4 w-4" /> Low or out
        </label>
        <button className={btn} onClick={() => setScanning(true)}>Scan barcode</button>
      </div>

      {[...groups.entries()].map(([g, items]) => (
        <section key={g} className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-2 font-semibold">{g}</h2>
          <ul className="divide-y divide-line">
            {items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <button className="min-w-0 basis-full text-left sm:basis-0 sm:flex-1" onClick={() => setSheet({ p, mode: "edit" })}>
                  <span className="font-medium">{p.name}</span>{" "}
                  <span className="text-xs text-muted">
                    {p.size ? `${qty(p.size)} ${p.unit}` : ""}
                    {p.minQty !== null ? ` · min ${qty(p.minQty)}` : ""}
                    {p.maxQty !== null ? ` · max ${qty(p.maxQty)}` : ""}
                  </span>
                </button>
                <span className="flex-1 sm:hidden" />
                <Level p={p} />
                <span className="w-12 text-right text-lg font-semibold tabular-nums" aria-label={`${qty(p.onHand)} on hand`}>{qty(p.onHand)}</span>
                <button className={btn} onClick={() => setSheet({ p, mode: "count" })}>Count</button>
                <button className={btn} onClick={() => setSheet({ p, mode: "received" })}>+ Received</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {list.length === 0 && <p className="text-sm text-muted">Nothing matches.</p>}

      {sheet && sheet.mode !== "edit" && <StockSheet p={sheet.p} mode={sheet.mode} onClose={() => setSheet(null)} />}
      {sheet?.mode === "edit" && <ProductSheet product={sheet.p} onClose={() => setSheet(null)} />}
      {newBarcode !== null && <ProductSheet product={null} barcode={newBarcode} products={products} onClose={() => setNewBarcode(null)} />}
      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onCode={(code) => {
            setScanning(false);
            const hit = products.find((p) => p.barcode === code);
            if (hit) setSheet({ p: hit, mode: "count" });
            else setNewBarcode(code);
          }}
        />
      )}
    </>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StockSheet({ p, mode, onClose }: { p: Product; mode: "count" | "received"; onClose: () => void }) {
  const [value, setValue] = useState(mode === "count" ? qty(p.onHand) : "1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await changeStock(p.id, mode, Number(value), note);
      if (r.ok) onClose();
      else setError(r.error);
    });
  return (
    <Sheet title={mode === "count" ? `Count ${p.name}` : `Received ${p.name}`} onClose={onClose}>
      <p className="text-sm text-muted">{lineTitle(p)} · on hand now {qty(p.onHand)}</p>
      <label className="mt-3 block text-sm font-medium">
        {mode === "count" ? "How many are on the shelf?" : "How many came in?"}
        <div className="mt-1 flex items-center gap-2">
          <button type="button" className={btn} onClick={() => setValue(qty(Math.max(0, Number(value || 0) - (mode === "count" ? 0.25 : 1))))} aria-label="Less">−</button>
          <input className={`${input} w-24 text-center text-lg`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <button type="button" className={btn} onClick={() => setValue(qty(Number(value || 0) + (mode === "count" ? 0.25 : 1)))} aria-label="More">+</button>
        </div>
      </label>
      {mode === "count" && <p className="mt-1 text-xs text-muted">Partly used? 0.5 = half, 0.25 = a quarter.</p>}
      <input className={`${input} mt-3 w-full`} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <button className={`${primary} mt-4 w-full`} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
    </Sheet>
  );
}

const emptyFields = (b = ""): ProductFields => ({ kind: "color", brand: "", line: "", shade: "", name: "", size: "", unit: "oz", barcode: b, saloncentricItem: "", cosmoprofItem: "", vendor: "", cost: "", price: "", minQty: "", maxQty: "" });

function ProductSheet({ product, barcode, products, onClose }: { product: Product | null; barcode?: string; products?: Product[]; onClose: () => void }) {
  const [f, setF] = useState<ProductFields>(() =>
    product
      ? {
          kind: product.kind, brand: product.brand, line: product.line ?? "", shade: product.shade ?? "", name: product.name, size: product.size === null ? "" : String(product.size), unit: product.unit,
          barcode: product.barcode ?? "", saloncentricItem: product.saloncentricItem ?? "", cosmoprofItem: product.cosmoprofItem ?? "", vendor: product.vendor ?? "",
          cost: product.costCents === null ? "" : (product.costCents / 100).toFixed(2), price: product.priceCents === null ? "" : (product.priceCents / 100).toFixed(2),
          minQty: product.minQty === null ? "" : qty(product.minQty), maxQty: product.maxQty === null ? "" : qty(product.maxQty),
        }
      : emptyFields(barcode ?? ""),
  );
  const [assign, setAssign] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const set = (k: keyof ProductFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const save = () =>
    start(async () => {
      const r = await saveProduct(product?.id ?? null, f);
      if (r.ok) onClose();
      else setError(r.error);
    });
  const assignTo = (p: Product) =>
    start(async () => {
      const r = await saveProduct(p.id, {
        kind: p.kind, brand: p.brand, line: p.line ?? "", shade: p.shade ?? "", name: p.name, size: p.size === null ? "" : String(p.size), unit: p.unit, barcode: barcode ?? "",
        saloncentricItem: p.saloncentricItem ?? "", cosmoprofItem: p.cosmoprofItem ?? "", vendor: p.vendor ?? "", cost: p.costCents === null ? "" : String(p.costCents / 100),
        price: p.priceCents === null ? "" : String(p.priceCents / 100), minQty: p.minQty === null ? "" : String(p.minQty), maxQty: p.maxQty === null ? "" : String(p.maxQty),
      });
      if (r.ok) onClose();
      else setError(r.error);
    });

  const matches = assign.trim() && products ? products.filter((p) => `${p.brand} ${p.line} ${p.name}`.toLowerCase().includes(assign.toLowerCase())).slice(0, 6) : [];

  return (
    <Sheet title={product ? `Edit ${product.name}` : barcode ? "New barcode" : "Add a product"} onClose={onClose}>
      {barcode && !product && products && (
        <div className="mb-4 rounded-lg border border-line p-3">
          <p className="text-sm">
            Barcode <code>{barcode}</code> isn&apos;t on any product yet. Which product is it?
          </p>
          <input className={`${input} mt-2 w-full`} placeholder="Search your products…" value={assign} onChange={(e) => setAssign(e.target.value)} aria-label="Find product" />
          <ul className="mt-1">
            {matches.map((p) => (
              <li key={p.id}>
                <button className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-background" onClick={() => assignTo(p)} disabled={saving}>
                  {lineTitle(p)} · <strong>{p.name}</strong>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Or fill in a new product below.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-sm">Type
          <select className={`${input} mt-1 w-full`} value={f.kind} onChange={set("kind")}>
            {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">Brand *<input className={`${input} mt-1 w-full`} value={f.brand} onChange={set("brand")} placeholder="Redken" /></label>
        <label className="text-sm">Line<input className={`${input} mt-1 w-full`} value={f.line} onChange={set("line")} placeholder="Shades EQ Gloss" /></label>
        <label className="text-sm">Shade<input className={`${input} mt-1 w-full`} value={f.shade} onChange={set("shade")} placeholder="09V" /></label>
        <label className="text-sm">Name *<input className={`${input} mt-1 w-full`} value={f.name} onChange={set("name")} placeholder="09V Platinum Ice" /></label>
        <label className="text-sm">Size
          <div className="mt-1 flex gap-1">
            <input className={`${input} w-full`} inputMode="decimal" value={f.size} onChange={set("size")} placeholder="2" />
            <select className={input} value={f.unit} onChange={set("unit")} aria-label="Unit">
              <option value="oz">oz</option><option value="ml">ml</option><option value="g">g</option><option value="each">each</option>
            </select>
          </div>
        </label>
        <label className="text-sm">Barcode<input className={`${input} mt-1 w-full`} value={f.barcode} onChange={set("barcode")} inputMode="numeric" /></label>
        <label className="text-sm">Min on hand<input className={`${input} mt-1 w-full`} inputMode="decimal" value={f.minQty} onChange={set("minQty")} placeholder="1" /></label>
        <label className="text-sm">Max (order up to)<input className={`${input} mt-1 w-full`} inputMode="decimal" value={f.maxQty} onChange={set("maxQty")} placeholder="3" /></label>
        <label className="col-span-2 text-sm">Usually order from
          <select className={`${input} mt-1 w-full`} value={f.vendor} onChange={set("vendor")}>
            <option value="">—</option><option value="saloncentric">SalonCentric</option><option value="cosmoprof">CosmoProf</option><option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm">SalonCentric item #<input className={`${input} mt-1 w-full`} value={f.saloncentricItem} onChange={set("saloncentricItem")} /></label>
        <label className="text-sm">CosmoProf item #<input className={`${input} mt-1 w-full`} value={f.cosmoprofItem} onChange={set("cosmoprofItem")} /></label>
        <label className="text-sm">Your cost ($)<input className={`${input} mt-1 w-full`} inputMode="decimal" value={f.cost} onChange={set("cost")} /></label>
        <label className="text-sm">Retail price ($)<input className={`${input} mt-1 w-full`} inputMode="decimal" value={f.price} onChange={set("price")} /></label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <div className="mt-4 flex gap-2">
        {product && (
          <button className={btn} disabled={saving} onClick={() => start(async () => { const r = await archiveProduct(product.id, true); if (r.ok) onClose(); else setError(r.error); })}>
            Remove
          </button>
        )}
        <button className={`${primary} flex-1`} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Sheet>
  );
}

// --- Reorder ----------------------------------------------------------------

function ReorderTab({ groups }: { groups: ReturnType<typeof reorderList> }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!groups.length) return <p className="rounded-xl border border-line bg-surface p-4 text-sm">Nothing to order. Products show up here when they reach their minimum (set a min on each product).</p>;

  const text = (g: (typeof groups)[number]) =>
    [`${g.vendor ? VENDOR_LABEL[g.vendor as Vendor] : "No supplier set"} order`, ...g.lines.map((l) => `${l.order} × ${lineTitle(l.product)} ${l.product.name}${l.product.size ? ` (${qty(l.product.size)} ${l.product.unit})` : ""}${l.itemNumber ? ` #${l.itemNumber}` : ""}`)].join("\n");
  const csv = (g: (typeof groups)[number]) => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const rows = [["Item number", "Quantity", "Brand", "Line", "Product", "Size", "On hand", "Unit cost"], ...g.lines.map((l) => [l.itemNumber ?? "", String(l.order), shortBrand(l.product.brand), l.product.line ?? "", l.product.name, l.product.size ? `${qty(l.product.size)} ${l.product.unit}` : "", qty(l.product.onHand), l.product.costCents === null ? "" : (l.product.costCents / 100).toFixed(2)])];
    const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `order-${g.vendor ?? "other"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      {groups.map((g) => (
        <section key={g.vendor ?? "none"} className="rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
            <h2 className="font-semibold">{g.vendor ? VENDOR_LABEL[g.vendor as Vendor] : "No supplier set"}</h2>
            <div className="flex gap-2">
              <button className={btn} onClick={() => navigator.clipboard.writeText(text(g)).then(() => setCopied(g.vendor ?? "none"))}>{copied === (g.vendor ?? "none") ? "Copied" : "Copy list"}</button>
              <button className={btn} onClick={() => csv(g)}>Download CSV</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="px-4 py-1 font-medium">Order</th>
                <th className="py-1 font-medium">Product</th>
                <th className="py-1 text-right font-medium">On hand</th>
                <th className="px-4 py-1 text-right font-medium">Item #</th>
              </tr>
            </thead>
            <tbody>
              {g.lines.map((l) => (
                <tr key={l.product.id} className="border-t border-line">
                  <td className="px-4 py-1.5 font-semibold tabular-nums">{l.order}</td>
                  <td className="py-1.5">{lineTitle(l.product)} · {l.product.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{qty(l.product.onHand)}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right">{l.itemNumber ?? <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {g.costCents > 0 && <p className="px-4 py-2 text-sm text-muted">Estimated cost {money(g.costCents)}</p>}
        </section>
      ))}
      <p className="text-xs text-muted">
        SalonCentric: paste into your cart or send to your rep. CosmoProf: use Quick Order with the item numbers. Add item numbers on each product to have them listed here.
      </p>
    </>
  );
}

// --- Add from catalog -------------------------------------------------------

function AddTab({ onDone }: { onDone: () => void }) {
  const lines = useMemo(() => catalogLines(), []);
  const [lineIdx, setLineIdx] = useState(0);
  const line: CatalogLine = lines[lineIdx];
  const types = useMemo(() => [...new Set(line.shades.flatMap((s) => s.types ?? []))], [line]);
  const [type, setType] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [size, setSize] = useState("");
  const [unit, setUnit] = useState<Unit>("oz");
  const [vendor, setVendor] = useState<Vendor | "">("");
  const [min, setMin] = useState("1");
  const [max, setMax] = useState("2");
  const [cost, setCost] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [saving, start] = useTransition();

  const activeType = types.length > 1 ? type || types[0] : types[0];
  const shades = line.shades.filter((s) => !activeType || !s.types || s.types.length === 0 || s.types.includes(activeType));
  const families = new Map<string, typeof shades>();
  for (const s of shades) families.set(s.family, [...(families.get(s.family) ?? []), s]);

  const chooseLine = (i: number) => {
    setLineIdx(i);
    setType("");
    setPicked(new Set());
    setMsg(null);
  };
  const toggle = (codes: string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const c of codes) {
        if (on) next.add(c);
        else next.delete(c);
      }
      return next;
    });

  const add = () =>
    start(async () => {
      const r = await addFromCatalog({
        brand: line.brand,
        line: line.line,
        picks: [...picked].map((code) => ({ code, type: types.length ? activeType : undefined })),
        size: size ? Number(size) : null,
        unit,
        vendor: vendor || null,
        minQty: min ? Number(min) : null,
        maxQty: max ? Number(max) : null,
        costCents: cost ? Math.round(Number(cost) * 100) : null,
      });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: `Added ${r.added}.${r.skipped ? ` ${r.skipped} were already in inventory.` : ""}` });
      setPicked(new Set());
    });

  return (
    <>
      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">From the Kenra &amp; Redken catalog</h2>
        <label className="block text-sm">Product line
          <select className={`${input} mt-1 w-full`} value={lineIdx} onChange={(e) => chooseLine(Number(e.target.value))}>
            {lines.map((l, i) => (
              <option key={`${l.brand}-${l.line}`} value={i}>{shortBrand(l.brand)} · {l.line} ({l.shades.length})</option>
            ))}
          </select>
        </label>
        {types.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Kind:</span>
            {types.map((t) => (
              <button key={t} type="button" aria-pressed={activeType === t} onClick={() => { setType(t); setPicked(new Set()); }} className={`rounded-lg px-3 py-1.5 ${activeType === t ? "bg-foreground font-semibold text-background" : "border border-line"}`}>
                {TYPE_LABEL[t] ?? t}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" className={btn} onClick={() => toggle(shades.map((s) => s.code), true)}>Select all {shades.length}</button>
          <button type="button" className={btn} onClick={() => setPicked(new Set())}>Clear</button>
          <span className="self-center text-muted">{picked.size} selected</span>
        </div>
        <div className="max-h-96 space-y-3 overflow-y-auto">
          {[...families.entries()].map(([fam, list]) => {
            const all = list.every((s) => picked.has(s.code));
            return (
              <fieldset key={fam}>
                <legend className="text-sm font-semibold">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" checked={all} onChange={(e) => toggle(list.map((s) => s.code), e.target.checked)} />
                    {fam}
                  </label>
                </legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {list.map((s) => (
                    <label key={s.code} className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-sm ${picked.has(s.code) ? "border-foreground font-semibold" : "border-line"}`}>
                      <input type="checkbox" className="sr-only" checked={picked.has(s.code)} onChange={(e) => toggle([s.code], e.target.checked)} />
                      {s.code}
                      {s.name && <span className="font-normal text-muted">{s.name}</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="text-sm">Size per tube/bottle
            <div className="mt-1 flex gap-1">
              <input className={`${input} w-full`} inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 2" />
              <select className={input} value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unit">
                <option value="oz">oz</option><option value="ml">ml</option><option value="g">g</option>
              </select>
            </div>
          </label>
          <label className="text-sm">Order from
            <select className={`${input} mt-1 w-full`} value={vendor} onChange={(e) => setVendor(e.target.value as Vendor | "")}>
              <option value="">—</option><option value="saloncentric">SalonCentric</option><option value="cosmoprof">CosmoProf</option><option value="other">Other</option>
            </select>
          </label>
          <label className="text-sm">Cost each ($)<input className={`${input} mt-1 w-full`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
          <label className="text-sm">Min on hand<input className={`${input} mt-1 w-full`} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></label>
          <label className="text-sm">Order up to<input className={`${input} mt-1 w-full`} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></label>
        </div>
        <p className="text-xs text-muted">Check the size on your tubes/bottles (it&apos;s used to turn grams or ounces used into tubes). Everything can be changed per product later. New products start at 0 on hand; use Count after adding.</p>
        {msg && <p role="status" className={`text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
        <div className="flex flex-wrap gap-2">
          <button className={primary} onClick={add} disabled={saving || picked.size === 0}>{saving ? "Adding…" : `Add ${picked.size || ""} to inventory`}</button>
          {msg?.ok && <button className={btn} onClick={onDone}>Go to stock</button>}
        </div>
      </section>
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Anything else</h2>
        <p className="text-sm text-muted">Developer, lightener, back-bar, retail, supplies, or another brand.</p>
        <button className={`${btn} mt-2`} onClick={() => setManual(true)}>Add a product by hand</button>
      </section>
      {manual && <ProductSheet product={null} onClose={() => setManual(false)} />}
    </>
  );
}
