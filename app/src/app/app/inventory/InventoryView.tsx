"use client";

import { lineInfo, linesFor, soldAt, SUPPLY_BRANDS } from "@/lib/inventory/supply";
import { useMemo, useState, useTransition } from "react";
import { money } from "@/lib/format";
import {
  catalogItems,
  catalogLines,
  inInventory,
  lineTitle,
  qty,
  reorderList,
  searchCatalog,
  shortBrand,
  stockLevel,
  TYPE_LABEL,
  VENDOR_LABEL,
  type CatalogItem,
  type Product,
  type Unit,
  type Vendor,
} from "@/lib/inventory/stock";
import { addFromCatalog, archiveProduct, changeStock, saveProduct, type ProductFields } from "./actions";
import BarcodeScanner from "./BarcodeScanner";

type Tab = "stock" | "reorder" | "add";
const input = "w-full rounded-xl border border-line bg-background px-3 py-2.5 text-base";
const btn = "rounded-xl border border-line px-3 py-2 text-sm hover:bg-background disabled:opacity-50";
const primary = "rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50";
const KINDS = [
  ["color", "Color"],
  ["developer", "Developer"],
  ["lightener", "Lightener"],
  ["treatment", "Treatment"],
  ["care", "Back bar"],
  ["retail", "Retail"],
  ["supply", "Supplies"],
] as const;

function Level({ p }: { p: Product }) {
  const l = stockLevel(p);
  if (l === "out") return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">Out</span>;
  if (l === "low") return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Low</span>;
  return null;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M7 9v6M10 9v6M13 9v6M16.5 9v6" />
    </svg>
  );
}

export default function InventoryView({ products }: { products: Product[] }) {
  const [tab, setTab] = useState<Tab>(products.length ? "stock" : "add");
  const reorder = useMemo(() => reorderList(products), [products]);
  const lowCount = reorder.reduce((n, g) => n + g.lines.length, 0);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Inventory</h1>
          <p className="text-sm text-muted">Counted in tubes and bottles. 0.5 = half a tube.</p>
        </div>
      </header>
      <nav aria-label="Inventory" className="flex gap-1 rounded-full border border-line bg-surface p-1 text-sm">
        {(
          [
            ["stock", `Stock · ${products.length}`],
            ["reorder", `Reorder${lowCount ? ` · ${lowCount}` : ""}`],
            ["add", "+ Add"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`flex-1 rounded-full px-3 py-2 ${tab === k ? "bg-foreground font-semibold text-background" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "stock" && <StockTab products={products} onAdd={() => setTab("add")} />}
      {tab === "reorder" && <ReorderTab groups={reorder} />}
      {tab === "add" && <AddTab products={products} onDone={() => setTab("stock")} />}
    </main>
  );
}

// --- Stock ------------------------------------------------------------------

function StockTab({ products, onAdd }: { products: Product[]; onAdd: () => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sheet, setSheet] = useState<{ p: Product; mode: Mode } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [newBarcode, setNewBarcode] = useState<string | null>(null);
  /** Quick +/− changes shown right away, before the page refreshes. */
  const [bump, setBump] = useState<Record<string, number>>({});
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const low = products.filter((p) => ["low", "out"].includes(stockLevel(p))).length;
  const kindsHere = KINDS.filter(([k]) => products.some((p) => p.kind === k));
  const list = products.filter((p) => {
    if (filter === "low" && !["low", "out"].includes(stockLevel(p))) return false;
    if (filter !== "all" && filter !== "low" && p.kind !== filter) return false;
    if (!q.trim()) return true;
    const hay = `${p.brand} ${p.line ?? ""} ${p.shade ?? ""} ${p.name} ${p.barcode ?? ""}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });
  const groups = new Map<string, Product[]>();
  for (const p of list) groups.set(lineTitle(p), [...(groups.get(lineTitle(p)) ?? []), p]);

  const step = (p: Product, d: number) => {
    const now = p.onHand + (bump[p.id] ?? 0);
    if (now + d < 0) return;
    setBump((b) => ({ ...b, [p.id]: (b[p.id] ?? 0) + d }));
    start(async () => {
      const r = await changeStock(p.id, "adjust", d, d > 0 ? "Quick +1" : "Quick −1");
      if (!r.ok) {
        setErr(r.error);
        setBump((b) => ({ ...b, [p.id]: (b[p.id] ?? 0) - d }));
      }
    });
  };
  // Server data refreshed: drop the local adjustments.
  const [seen, setSeen] = useState(products);
  if (seen !== products) {
    setSeen(products);
    setBump({});
  }

  if (!products.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-6 text-center">
        <p className="font-semibold">No products yet</p>
        <p className="mt-1 text-sm text-muted">Add your Kenra and Redken shades from the catalog, or scan a box.</p>
        <button className={`${primary} mt-3`} onClick={onAdd}>Add products</button>
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 space-y-2 bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3">
            <SearchIcon />
            <input className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none" placeholder="Find 6N, 09V, developer…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a product" type="search" />
          </label>
          <button className={`${btn} flex items-center gap-1.5`} onClick={() => setScanning(true)} aria-label="Scan a barcode">
            <ScanIcon /> <span className="hidden sm:inline">Scan</span>
          </button>
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 text-sm" role="group" aria-label="Show">
          {[["all", `All · ${products.length}`], ["low", `Low or out · ${low}`], ...kindsHere].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`shrink-0 rounded-full border px-3 py-1.5 ${filter === k ? "border-foreground bg-foreground text-background" : "border-line"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {err && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{err}</p>}

      {[...groups.entries()].map(([g, items]) => (
        <details key={g} open className="group rounded-2xl border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <span className="font-semibold">{g}</span>
            <span className="text-sm text-muted">{items.length} <span className="inline-block transition group-open:rotate-90">›</span></span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {items.map((p) => {
              const onHand = p.onHand + (bump[p.id] ?? 0);
              return (
                <li key={p.id} className="flex items-center gap-2 px-4 py-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ p, mode: "edit" })}>
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block text-xs text-muted">
                      {p.size ? `${qty(p.size)} ${p.unit}` : "Size not set"}
                      {p.minQty !== null ? ` · reorder at ${qty(p.minQty)}` : ""}
                    </span>
                  </button>
                  <Level p={{ ...p, onHand }} />
                  <div className="flex items-center rounded-full border border-line">
                    <button className="size-9 rounded-full text-lg disabled:opacity-30" onClick={() => step(p, -1)} disabled={onHand < 1} aria-label={`One less ${p.name}`}>−</button>
                    <button className="min-w-10 px-1 text-center font-mono text-base font-semibold tabular-nums" onClick={() => setSheet({ p, mode: "count" })} aria-label={`${qty(onHand)} on hand. Count ${p.name}`}>
                      {qty(onHand)}
                    </button>
                    <button className="size-9 rounded-full text-lg" onClick={() => step(p, 1)} aria-label={`One more ${p.name}`}>+</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
      {list.length === 0 && <p className="text-sm text-muted">Nothing matches.</p>}
      <p className="text-xs text-muted">Tap − or + for whole tubes. Tap the number to count a partly used one (0.5, 0.25). Tap a name for details.</p>

      {sheet && <ProductSheet product={sheet.p} initialMode={sheet.mode} onClose={() => setSheet(null)} />}
      {newBarcode !== null && <NewBarcodeSheet code={newBarcode} products={products} onClose={() => setNewBarcode(null)} />}
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
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="-mr-2 rounded-full px-3 py-1 text-xl" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

type Mode = "count" | "received" | "edit";

const fieldsFrom = (p: Product | null, barcode = ""): ProductFields =>
  p
    ? {
        kind: p.kind,
        brand: p.brand,
        line: p.line ?? "",
        shade: p.shade ?? "",
        name: p.name,
        size: p.size === null ? "" : String(p.size),
        unit: p.unit,
        barcode: p.barcode ?? "",
        saloncentricItem: p.saloncentricItem ?? "",
        cosmoprofItem: p.cosmoprofItem ?? "",
        vendor: p.vendor ?? "",
        cost: p.costCents === null ? "" : (p.costCents / 100).toFixed(2),
        price: p.priceCents === null ? "" : (p.priceCents / 100).toFixed(2),
        minQty: p.minQty === null ? "" : qty(p.minQty),
        maxQty: p.maxQty === null ? "" : qty(p.maxQty),
      }
    : { kind: "color", brand: "", line: "", shade: "", name: "", size: "", unit: "oz", barcode, saloncentricItem: "", cosmoprofItem: "", vendor: "", cost: "", price: "", minQty: "", maxQty: "" };

/** One sheet per product: Count, Received, or Details. */
function ProductSheet({ product, initialMode, onClose }: { product: Product; initialMode: Mode; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  return (
    <Sheet title={product.name} onClose={onClose}>
      <p className="-mt-2 mb-3 text-sm text-muted">{lineTitle(product)} · {qty(product.onHand)} on hand</p>
      <div className="mb-4 flex gap-1 rounded-full border border-line p-1 text-sm" role="tablist">
        {(
          [
            ["count", "Count"],
            ["received", "Received"],
            ["edit", "Details"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`flex-1 rounded-full py-1.5 ${mode === k ? "bg-foreground font-semibold text-background" : "text-muted"}`}>
            {l}
          </button>
        ))}
      </div>
      {mode === "edit" ? <ProductForm product={product} onClose={onClose} /> : <StockForm key={mode} p={product} mode={mode} onClose={onClose} />}
    </Sheet>
  );
}

function StockForm({ p, mode, onClose }: { p: Product; mode: "count" | "received"; onClose: () => void }) {
  const [value, setValue] = useState(mode === "count" ? qty(p.onHand) : "1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const stepBy = mode === "count" ? 0.25 : 1;
  const save = () =>
    start(async () => {
      const r = await changeStock(p.id, mode, Number(value), note);
      if (r.ok) onClose();
      else setError(r.error);
    });
  return (
    <div>
      <p className="text-sm font-medium">{mode === "count" ? "How many are on the shelf?" : "How many came in?"}</p>
      <div className="mt-2 flex items-center justify-center gap-3">
        <button type="button" className="size-12 rounded-full border border-line text-2xl" onClick={() => setValue(qty(Math.max(0, Number(value || 0) - stepBy)))} aria-label="Less">−</button>
        <input className="w-28 rounded-2xl border border-line bg-background py-3 text-center font-mono text-3xl" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Amount" />
        <button type="button" className="size-12 rounded-full border border-line text-2xl" onClick={() => setValue(qty(Number(value || 0) + stepBy))} aria-label="More">+</button>
      </div>
      {mode === "count" && (
        <div className="mt-3 flex justify-center gap-2">
          {["0.25", "0.5", "0.75"].map((f) => (
            <button key={f} type="button" className="rounded-full border border-line px-3 py-1 text-sm" onClick={() => setValue(qty(Math.floor(Number(value || 0)) + Number(f)))}>
              +{f === "0.25" ? "¼" : f === "0.5" ? "½" : "¾"}
            </button>
          ))}
        </div>
      )}
      <input className={`${input} mt-4`} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <button className={`${primary} mt-4 w-full py-3`} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
    </div>
  );
}

function ProductForm({ product, barcode, onClose }: { product: Product | null; barcode?: string; onClose: () => void }) {
  const [f, setF] = useState<ProductFields>(() => fieldsFrom(product, barcode ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const set = (k: keyof ProductFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  // Picking a known brand + line fills in its type and usual size (new products only; nothing typed is overwritten).
  const setLine = (k: "brand" | "line") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...f, [k]: e.target.value };
    const info = !product ? lineInfo(next.brand, next.line) : null;
    if (info) {
      next.kind = info.kind;
      if (!f.size && info.size) next.size = String(info.size);
      if (info.unit) next.unit = info.unit;
    }
    if (!product && !f.vendor && k === "brand") {
      const where = soldAt(next.brand)[0];
      if (where === "SalonCentric" || where === "CosmoProf") next.vendor = where.toLowerCase();
    }
    setF(next);
  };
  const lineOptions = linesFor(f.brand);
  const sold = soldAt(f.brand);
  const save = () =>
    start(async () => {
      const r = await saveProduct(product?.id ?? null, f);
      if (r.ok) onClose();
      else setError(r.error);
    });
  const label = "block text-sm font-medium";
  return (
    <div className="space-y-3">
      <label className={label}>
        Type
        <select className={`${input} mt-1`} value={f.kind} onChange={set("kind")}>
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Brand<input className={`${input} mt-1`} value={f.brand} onChange={setLine("brand")} placeholder="Redken" list="supply-brands" autoComplete="off" /></label>
        <label className={label}>Line<input className={`${input} mt-1`} value={f.line} onChange={setLine("line")} placeholder="Shades EQ Gloss" list="supply-lines" autoComplete="off" /></label>
        <datalist id="supply-brands">{SUPPLY_BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
        <datalist id="supply-lines">{lineOptions.map((l) => <option key={l} value={l} />)}</datalist>
        <label className={label}>Shade<input className={`${input} mt-1`} value={f.shade} onChange={set("shade")} placeholder="09V" /></label>
        <label className={label}>Name<input className={`${input} mt-1`} value={f.name} onChange={set("name")} placeholder="09V Platinum Ice" /></label>
      </div>
      {sold.length > 0 && <p className="-mt-1 text-xs text-muted">Usually sold at {sold.join(", ")}.</p>}
      <label className={label}>
        Size of one tube / bottle
        <div className="mt-1 flex gap-2">
          <input className={input} inputMode="decimal" value={f.size} onChange={set("size")} placeholder="2" />
          <select className={`${input} w-28`} value={f.unit} onChange={set("unit")} aria-label="Unit">
            <option value="oz">oz</option>
            <option value="ml">ml</option>
            <option value="g">g</option>
            <option value="each">each</option>
          </select>
        </div>
      </label>
      <details className="rounded-xl border border-line p-3" open={!product}>
        <summary className="cursor-pointer text-sm font-semibold">Reorder, supplier &amp; price</summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className={label}>Reorder at<input className={`${input} mt-1`} inputMode="decimal" value={f.minQty} onChange={set("minQty")} placeholder="1" /></label>
          <label className={label}>Order up to<input className={`${input} mt-1`} inputMode="decimal" value={f.maxQty} onChange={set("maxQty")} placeholder="3" /></label>
          <label className={`${label} col-span-2`}>
            Supplier
            <select className={`${input} mt-1`} value={f.vendor} onChange={set("vendor")}>
              <option value="">—</option>
              <option value="saloncentric">SalonCentric</option>
              <option value="cosmoprof">CosmoProf</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className={label}>SalonCentric #<input className={`${input} mt-1`} value={f.saloncentricItem} onChange={set("saloncentricItem")} /></label>
          <label className={label}>CosmoProf #<input className={`${input} mt-1`} value={f.cosmoprofItem} onChange={set("cosmoprofItem")} /></label>
          <label className={label}>Your cost ($)<input className={`${input} mt-1`} inputMode="decimal" value={f.cost} onChange={set("cost")} /></label>
          <label className={label}>Retail price ($)<input className={`${input} mt-1`} inputMode="decimal" value={f.price} onChange={set("price")} /></label>
          <label className={`${label} col-span-2`}>Barcode<input className={`${input} mt-1`} value={f.barcode} onChange={set("barcode")} inputMode="numeric" /></label>
        </div>
      </details>
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex gap-2">
        {product && (
          <button
            className={btn}
            disabled={saving}
            onClick={() =>
              start(async () => {
                const r = await archiveProduct(product.id, true);
                if (r.ok) onClose();
                else setError(r.error);
              })
            }
          >
            Remove
          </button>
        )}
        <button className={`${primary} flex-1 py-3`} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

/** A scanned barcode that isn't on any product yet: link it to one you have, or add it. */
function NewBarcodeSheet({ code, products, onClose }: { code: string; products: Product[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const matches = q.trim() ? products.filter((p) => q.toLowerCase().split(/\s+/).every((w) => `${p.brand} ${p.line ?? ""} ${p.name}`.toLowerCase().includes(w))).slice(0, 8) : [];
  const link = (p: Product) =>
    start(async () => {
      const r = await saveProduct(p.id, { ...fieldsFrom(p), barcode: code });
      if (r.ok) onClose();
      else setError(r.error);
    });
  return (
    <Sheet title="New barcode" onClose={onClose}>
      {manual ? (
        <ProductForm product={null} barcode={code} onClose={onClose} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-mono">{code}</span> isn&rsquo;t on a product yet. Which one is it? Next time, scanning it opens the product.
          </p>
          <label className="flex items-center gap-2 rounded-xl border border-line bg-background px-3">
            <SearchIcon />
            <input className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none" placeholder="Type the shade, e.g. 6N" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find product" autoFocus />
          </label>
          <ul className="divide-y divide-line">
            {matches.map((p) => (
              <li key={p.id}>
                <button className="w-full py-2.5 text-left" onClick={() => link(p)} disabled={saving}>
                  <span className="font-medium">{p.name}</span> <span className="text-sm text-muted">{lineTitle(p)}</span>
                </button>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
          <p className="text-sm text-muted">
            Not in your inventory yet? Use <strong>+ Add</strong> and scan it there, or{" "}
            <button className="underline" onClick={() => setManual(true)}>add it by hand</button>.
          </p>
        </div>
      )}
    </Sheet>
  );
}

// --- Reorder ----------------------------------------------------------------

function ReorderTab({ groups }: { groups: ReturnType<typeof reorderList> }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!groups.length) return <p className="rounded-2xl border border-line bg-surface p-4 text-sm">Nothing to order. Products show up here when they reach their reorder point (set it under a product&rsquo;s Details).</p>;

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
        <section key={g.vendor ?? "none"} className="rounded-2xl border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="font-semibold">{g.vendor ? VENDOR_LABEL[g.vendor as Vendor] : "No supplier set"}</h2>
            <div className="flex gap-2">
              <button className={btn} onClick={() => navigator.clipboard.writeText(text(g)).then(() => setCopied(g.vendor ?? "none"))}>{copied === (g.vendor ?? "none") ? "Copied" : "Copy list"}</button>
              <button className={btn} onClick={() => csv(g)}>CSV</button>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {g.lines.map((l) => (
              <li key={l.product.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-10 text-center font-mono text-lg font-semibold">{l.order}×</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.product.name}</span>
                  <span className="block text-xs text-muted">{lineTitle(l.product)} · {qty(l.product.onHand)} on hand{l.itemNumber ? ` · #${l.itemNumber}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
          {g.costCents > 0 && <p className="px-4 py-2 text-sm text-muted">Estimated cost {money(g.costCents)}</p>}
        </section>
      ))}
      <p className="text-xs text-muted">SalonCentric: paste into your cart or send to your rep. CosmoProf: use Quick Order with the item numbers.</p>
    </>
  );
}

// --- Add ----------------------------------------------------------------------

type Defaults = { size: string; unit: Unit; vendor: Vendor | ""; min: string; max: string; cost: string };
const DEFAULTS_KEY = "chairvana-inventory-defaults";
const loadDefaults = (): Defaults => {
  const base: Defaults = { size: "", unit: "oz", vendor: "", min: "1", max: "2", cost: "" };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? "{}") };
  } catch {
    return base;
  }
};

type Pick = CatalogItem & { barcode: string | null };

function AddTab({ products, onDone }: { products: Product[]; onDone: () => void }) {
  const lines = useMemo(() => catalogLines(), []);
  const items = useMemo(() => catalogItems(lines), [lines]);
  const brands = useMemo(() => [...new Set(lines.map((l) => l.brand))], [lines]);

  const [q, setQ] = useState("");
  const [brand, setBrand] = useState(brands[0] ?? "");
  const [lineName, setLineName] = useState("");
  const [type, setType] = useState("");
  const [shade, setShade] = useState("");
  const [tray, setTray] = useState<Pick[]>([]);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [d, setD] = useState<Defaults>(() => (typeof window === "undefined" ? { size: "", unit: "oz", vendor: "", min: "1", max: "2", cost: "" } : loadDefaults()));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState<string | null | false>(false);
  const [saving, start] = useTransition();

  const brandLines = lines.filter((l) => l.brand === brand);
  const line = brandLines.find((l) => l.line === lineName) ?? null;
  const types = line ? [...new Set(line.shades.flatMap((s) => s.types ?? []))] : [];
  const activeType = types.length ? type || types[0] : "";
  const lineShades = line ? line.shades.filter((s) => !activeType || !s.types?.length || s.types.includes(activeType)) : [];
  const families = [...new Set(lineShades.map((s) => s.family))];
  const results = useMemo(() => searchCatalog(items, q), [items, q]);

  const addPick = (i: CatalogItem) => {
    setMsg(null);
    setTray((t) => (t.some((x) => x.key === i.key) ? t : [...t, { ...i, barcode }]));
    setBarcode(null);
  };
  const itemFor = (code: string) => items.find((i) => i.brand === brand && i.line === lineName && i.code === code && (i.type ?? "") === (activeType ?? ""));

  const submit = () =>
    start(async () => {
      try {
        localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d));
      } catch {}
      const byLine = new Map<string, Pick[]>();
      for (const p of tray) byLine.set(`${p.brand}|${p.line}`, [...(byLine.get(`${p.brand}|${p.line}`) ?? []), p]);
      let added = 0;
      let skipped = 0;
      for (const [k, list] of byLine) {
        const [b, l] = k.split("|");
        const r = await addFromCatalog({
          brand: b,
          line: l,
          picks: list.map((p) => ({ code: p.code, type: p.type ?? undefined, barcode: p.barcode })),
          size: d.size ? Number(d.size) : null,
          unit: d.unit,
          vendor: d.vendor || null,
          minQty: d.min ? Number(d.min) : null,
          maxQty: d.max ? Number(d.max) : null,
          costCents: d.cost ? Math.round(Number(d.cost) * 100) : null,
        });
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        added += r.added;
        skipped += r.skipped;
      }
      setMsg({ ok: true, text: `Added ${added} to inventory.${skipped ? ` ${skipped} ${skipped === 1 ? "was" : "were"} already there.` : ""} Count them on the Stock tab.` });
      setTray([]);
    });

  return (
    <div className="space-y-4">
      {/* 1. Type to find, or scan */}
      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Find a color</h2>
          <button className={`${btn} flex items-center gap-1.5`} onClick={() => setScanning(true)}>
            <ScanIcon /> Scan a box
          </button>
        </div>
        {barcode && (
          <p className="rounded-xl bg-accent/15 px-3 py-2 text-sm">
            Barcode <span className="font-mono">{barcode}</span> scanned. Now pick which color it is; it&rsquo;ll be saved with that product.{" "}
            <button className="underline" onClick={() => setBarcode(null)}>Cancel</button>
          </p>
        )}
        <label className="flex items-center gap-2 rounded-xl border border-line bg-background px-3">
          <SearchIcon />
          <input className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none" placeholder="Start typing: 6N, 09V, Shades EQ gloss…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a color in the catalog" type="search" />
        </label>
        {q.trim() && (
          <ul className="divide-y divide-line rounded-xl border border-line" aria-live="polite">
            {results.map((i) => {
              const have = inInventory(i, products);
              const queued = tray.some((t) => t.key === i.key);
              return (
                <li key={i.key}>
                  <button className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-background disabled:opacity-50" onClick={() => addPick(i)} disabled={queued || (have && !barcode)}>
                    <span className="min-w-0">
                      <span className="font-mono font-semibold">{i.code}</span> {i.name && <span>{i.name}</span>}
                      <span className="block text-xs text-muted">{i.lineLabel} · {i.family}</span>
                    </span>
                    <span className="shrink-0 text-sm">{queued ? "Added ✓" : have ? (barcode ? "Link" : "In stock") : "+ Add"}</span>
                  </button>
                </li>
              );
            })}
            {!results.length && <li className="px-3 py-2.5 text-sm text-muted">Not in the catalog. <button className="underline" onClick={() => setManual(barcode)}>Add it by hand</button></li>}
          </ul>
        )}
      </section>

      {/* 2. Or choose step by step */}
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Or choose from a line</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Brand
            <select className={`${input} mt-1`} value={brand} onChange={(e) => { setBrand(e.target.value); setLineName(""); setType(""); setShade(""); }}>
              {brands.map((b) => <option key={b} value={b}>{shortBrand(b)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Product line
            <select className={`${input} mt-1`} value={lineName} onChange={(e) => { setLineName(e.target.value); setType(""); setShade(""); }}>
              <option value="">Choose…</option>
              {brandLines.map((l) => <option key={l.line} value={l.line}>{l.line}</option>)}
            </select>
          </label>
          {types.length > 0 && (
            <label className="text-sm font-medium">
              Kind
              <select className={`${input} mt-1`} value={activeType} onChange={(e) => { setType(e.target.value); setShade(""); }}>
                {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
              </select>
            </label>
          )}
          {line && (
            <label className="text-sm font-medium">
              Color
              <select className={`${input} mt-1`} value={shade} onChange={(e) => setShade(e.target.value)}>
                <option value="">Choose a shade…</option>
                {families.map((f) => (
                  <optgroup key={f} label={f}>
                    {lineShades.filter((s) => s.family === f).map((s) => <option key={s.code} value={s.code}>{s.code}{s.name ? ` ${s.name}` : ""}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
        </div>
        {line && (
          <div className="flex flex-wrap gap-2">
            <button
              className={primary}
              disabled={!shade}
              onClick={() => {
                const i = itemFor(shade);
                if (i) addPick(i);
                setShade("");
              }}
            >
              Add this color
            </button>
            <button
              className={btn}
              onClick={() => {
                for (const s of lineShades) {
                  const i = itemFor(s.code);
                  if (i && !inInventory(i, products)) addPick(i);
                }
              }}
            >
              Add all {lineShades.length} in this line
            </button>
          </div>
        )}
      </section>

      {/* 3. Tray */}
      {(tray.length > 0 || msg) && (
        <section className="space-y-3 rounded-2xl border-2 border-foreground/80 bg-surface p-4">
          {tray.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">To add · {tray.length}</h2>
                <button className="text-sm underline" onClick={() => setTray([])}>Clear</button>
              </div>
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {tray.map((t) => (
                  <span key={t.key} className="flex items-center gap-1 rounded-full border border-line bg-background py-1 pl-3 pr-1 text-sm">
                    <span className="font-mono font-semibold">{t.code}</span>
                    <span className="text-xs text-muted">{t.lineLabel.replace(/^(Kenra|Redken) /, "")}</span>
                    {t.barcode && <span className="text-xs" title={`Barcode ${t.barcode}`}>▮▮</span>}
                    <button className="size-6 rounded-full text-muted hover:bg-surface" aria-label={`Remove ${t.code}`} onClick={() => setTray((x) => x.filter((y) => y.key !== t.key))}>×</button>
                  </span>
                ))}
              </div>
              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-semibold">Details for these (optional)</summary>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <label className="text-sm">
                    Size each
                    <div className="mt-1 flex gap-1">
                      <input className={input} inputMode="decimal" value={d.size} onChange={(e) => setD({ ...d, size: e.target.value })} placeholder="2" />
                      <select className={`${input} w-20`} value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value as Unit })} aria-label="Unit">
                        <option value="oz">oz</option>
                        <option value="ml">ml</option>
                        <option value="g">g</option>
                      </select>
                    </div>
                  </label>
                  <label className="text-sm">
                    Supplier
                    <select className={`${input} mt-1`} value={d.vendor} onChange={(e) => setD({ ...d, vendor: e.target.value as Vendor | "" })}>
                      <option value="">—</option>
                      <option value="saloncentric">SalonCentric</option>
                      <option value="cosmoprof">CosmoProf</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="text-sm">Cost each ($)<input className={`${input} mt-1`} inputMode="decimal" value={d.cost} onChange={(e) => setD({ ...d, cost: e.target.value })} /></label>
                  <label className="text-sm">Reorder at<input className={`${input} mt-1`} inputMode="decimal" value={d.min} onChange={(e) => setD({ ...d, min: e.target.value })} /></label>
                  <label className="text-sm">Order up to<input className={`${input} mt-1`} inputMode="decimal" value={d.max} onChange={(e) => setD({ ...d, max: e.target.value })} /></label>
                </div>
                <p className="mt-2 text-xs text-muted">Remembered for next time. You can change any product later.</p>
              </details>
              <button className={`${primary} w-full py-3`} onClick={submit} disabled={saving}>{saving ? "Adding…" : `Add ${tray.length} to inventory`}</button>
            </>
          )}
          {msg && (
            <p role="status" className={`text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>
              {msg.text} {msg.ok && <button className="underline" onClick={onDone}>Go to stock</button>}
            </p>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-dashed border-line p-4 text-sm">
        <p className="font-semibold">Something else?</p>
        <p className="text-muted">Developer, lightener, back bar, retail, supplies or another brand.</p>
        <button className={`${btn} mt-2`} onClick={() => setManual(barcode)}>Add a product by hand</button>
      </section>

      {manual !== false && (
        <Sheet title="Add a product" onClose={() => setManual(false)}>
          <ProductForm product={null} barcode={manual ?? undefined} onClose={() => setManual(false)} />
        </Sheet>
      )}
      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onCode={(code) => {
            setScanning(false);
            const hit = products.find((p) => p.barcode === code);
            if (hit) setMsg({ ok: true, text: `That's ${hit.name} (${lineTitle(hit)}), already in inventory.` });
            else {
              setBarcode(code);
              setMsg(null);
            }
          }}
        />
      )}
    </div>
  );
}
