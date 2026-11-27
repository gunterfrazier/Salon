"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { offeredBy, PRICE_TYPES, STAGES, type OwnInput, type PriceType, type ServiceInput, type Stage } from "@/lib/services/edit";
import { archiveService, confirmPrice, deleteGroup, moveGroup, moveService, saveGroup, saveService, setStylistPricing } from "./actions";
import type { OwnPrices } from "@/lib/staff/stylists";

export type EditorGroup = { id: string; name: string };
export type EditorStylist = { id: string; name: string; serviceIds: string[] | null; own?: OwnPrices };
export type EditorService = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceType: PriceType;
  priceCents: number;
  active: number;
  processing: number;
  finish: number;
  bookDuringProcessing: boolean;
  depositCategory: "standard" | "color";
  stage: string;
  bookableOnline: boolean;
  isAddOn: boolean;
  archived: boolean;
  needsReview: boolean;
};

const input = "rounded-lg border border-line bg-background px-3 py-2 text-base";
const small = "rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-background disabled:opacity-40";
const chip = "rounded-full px-2 py-0.5 text-[11px] font-semibold";

const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
function priceLabel(s: Pick<EditorService, "priceType" | "priceCents">) {
  if (s.priceType === "free") return "Free";
  if (s.priceType === "starting_at") return `${money(s.priceCents)}+`;
  if (s.priceType === "hourly") return `${money(s.priceCents)}/hr`;
  return money(s.priceCents);
}

/** The menu price, or the range across stylists who offer it when some charge their own. */
function rangeLabel(s: EditorService, stylists: EditorStylist[]) {
  const prices = stylists.filter((x) => !x.serviceIds || x.serviceIds.includes(s.id)).map((x) => x.own?.[s.id]?.price ?? s.priceCents);
  const lo = Math.min(...prices, s.priceCents);
  const hi = Math.max(...prices, s.priceCents);
  if (s.priceType === "free" || lo === hi) return priceLabel(s);
  return `${money(lo)}–${money(hi).replace("$", "")}${s.priceType === "starting_at" ? "+" : s.priceType === "hourly" ? "/hr" : ""}`;
}

/** Settings → Services: the salon's menu, its groups, and who offers each service. */
export default function ServicesEditor({ groups, services, stylists, stylistPricing = false }: { groups: EditorGroup[]; services: EditorService[]; stylists: EditorStylist[]; stylistPricing?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<EditorService | "new" | null>(null);
  const [newIn, setNewIn] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string | null; name: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const live = services.filter((s) => !s.archived);
  const archived = services.filter((s) => s.archived);
  const review = live.filter((s) => s.needsReview);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (ok) setMsg({ ok: true, text: ok });
        router.refresh();
      } else setMsg({ ok: false, text: r.error ?? "Something went wrong." });
    });

  const who = (id: string) => {
    const ids = offeredBy(stylists, id);
    if (!stylists.length) return null;
    if (ids.length === stylists.length) return stylists.length > 1 ? "Everyone" : null;
    if (!ids.length) return "Nobody offers it";
    return ids.length === 1 ? `${stylists.find((s) => s.id === ids[0])?.name.split(" ")[0]} only` : `${ids.length} of ${stylists.length} stylists`;
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Services</h1>
          <p className="text-sm text-muted">{live.length} services in {groups.length} groups. Clients see them in this order. Tap a service to edit it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={small} disabled={pending} onClick={() => setRenaming({ id: null, name: "" })}>Add group</button>
          <button className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-semibold text-background disabled:opacity-50" disabled={pending || !groups.length} onClick={() => { setNewIn(groups[0]?.id ?? null); setEditing("new"); }}>
            Add service
          </button>
        </div>
      </header>

      {msg && <p role="status" className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-line bg-surface" : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"}`}>{msg.text}</p>}

      {stylists.length > 0 && (
        <label className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
          <span>
            <span className="font-medium">Stylists can have their own price and time</span>
            <span className="block text-muted">For example senior and junior pricing. Set them inside each service, under <em>Who offers it</em>. Turning this off keeps them saved but unused.</span>
          </span>
          <input type="checkbox" className="mt-1 h-5 w-5" disabled={pending} checked={stylistPricing} onChange={(e) => run(() => setStylistPricing(e.target.checked), e.target.checked ? "Stylists can now have their own prices and times." : "Everyone uses the menu prices and times again.")} />
        </label>
      )}

      {review.length > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <strong>{review.length} price{review.length === 1 ? "" : "s"} to review.</strong> These came from the starting menu. Open each one and save it, or tap <em>Price is right</em>.
        </p>
      )}

      {renaming && renaming.id === null && <GroupNameForm initial="" label="New group" pending={pending} onCancel={() => setRenaming(null)} onSave={(name) => run(async () => { const r = await saveGroup(null, name); if (r.ok) setRenaming(null); return r; }, `Added the ${name} group.`)} />}

      {groups.length === 0 && <p className="text-sm text-muted">No groups yet. Add a group (like Cuts or Color), then add services to it.</p>}

      {groups.map((g, gi) => {
        const inGroup = live.filter((s) => s.categoryId === g.id);
        const hasAny = services.some((s) => s.categoryId === g.id);
        return (
          <section key={g.id} aria-label={g.name} className="space-y-2">
            {renaming?.id === g.id ? (
              <GroupNameForm initial={g.name} label="Group name" pending={pending} onCancel={() => setRenaming(null)} onSave={(name) => run(async () => { const r = await saveGroup(g.id, name); if (r.ok) setRenaming(null); return r; }, "Renamed.")} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{g.name}</h2>
                <div className="flex flex-wrap gap-1">
                  <button className={small} disabled={pending || gi === 0} onClick={() => run(() => moveGroup(g.id, -1))} aria-label={`Move ${g.name} up`}>↑</button>
                  <button className={small} disabled={pending || gi === groups.length - 1} onClick={() => run(() => moveGroup(g.id, 1))} aria-label={`Move ${g.name} down`}>↓</button>
                  <button className={small} disabled={pending} onClick={() => setRenaming({ id: g.id, name: g.name })}>Rename</button>
                  <button className={small} disabled={pending} onClick={() => { setNewIn(g.id); setEditing("new"); }}>Add here</button>
                  {!hasAny && <button className={small} disabled={pending} onClick={() => confirm(`Delete the ${g.name} group?`) && run(() => deleteGroup(g.id), `Deleted ${g.name}.`)}>Delete</button>}
                </div>
              </div>
            )}
            {inGroup.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {inGroup.map((s, i) => {
                  const w = who(s.id);
                  return (
                    <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                      <button className="min-w-0 flex-1 py-0.5 text-left" onClick={() => setEditing(s)}>
                        <span className="block font-medium">{s.name}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {s.needsReview && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>price to review</span>}
                          {!s.bookableOnline && <span className={`${chip} bg-background text-muted`}>not online</span>}
                          {s.isAddOn && <span className={`${chip} bg-background text-muted`}>add-on</span>}
                          {w && <span className={`${chip} ${w === "Nobody offers it" ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" : "bg-background text-muted"}`}>{w}</span>}
                        </span>
                      </button>
                      <span className="shrink-0 text-right text-sm tabular-nums">
                        {stylistPricing ? rangeLabel(s, stylists) : priceLabel(s)}
                        <span className="block text-xs text-muted">{mins(s.active + s.processing + s.finish)}</span>
                      </span>
                      <span className="flex shrink-0 flex-col gap-1 sm:flex-row">
                        {s.needsReview && <button className={small} disabled={pending} onClick={() => run(() => confirmPrice(s.id), `${s.name}: price confirmed.`)}>Price is right</button>}
                        <span className="flex gap-1">
                          <button className={small} disabled={pending || i === 0} onClick={() => run(() => moveService(s.id, -1))} aria-label={`Move ${s.name} up`}>↑</button>
                          <button className={small} disabled={pending || i === inGroup.length - 1} onClick={() => run(() => moveService(s.id, 1))} aria-label={`Move ${s.name} down`}>↓</button>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">No services in this group yet.</p>
            )}
          </section>
        );
      })}

      {archived.length > 0 && (
        <section className="space-y-2">
          <button className="text-sm text-muted underline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide" : "Show"} archived services ({archived.length})
          </button>
          {showArchived && (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {archived.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    {s.name}
                    <span className="block text-xs text-muted">{groups.find((g) => g.id === s.categoryId)?.name} · {priceLabel(s)}</span>
                  </span>
                  <button className={small} disabled={pending} onClick={() => run(() => archiveService(s.id, false), `${s.name} is back on the menu.`)}>Restore</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && (
        <ServiceSheet
          key={editing === "new" ? `new-${newIn}` : editing.id}
          service={editing === "new" ? null : editing}
          groupId={editing === "new" ? (newIn ?? groups[0].id) : editing.categoryId}
          groups={groups}
          stylists={stylists}
          stylistPricing={stylistPricing}
          onClose={() => setEditing(null)}
          onDone={(text) => {
            setEditing(null);
            setMsg({ ok: true, text });
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function GroupNameForm({ initial, label, pending, onSave, onCancel }: { initial: string; label: string; pending: boolean; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); onSave(name); }}>
      <label className="flex-1 text-sm">
        {label}
        <input autoFocus className={`${input} mt-1 w-full`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Color" />
      </label>
      <button type="submit" className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50" disabled={pending}>Save</button>
      <button type="button" className={small} onClick={onCancel}>Cancel</button>
    </form>
  );
}

const asMinutes = (v: string) => (v.trim() === "" ? 0 : Number(v));
const digits = (v: string) => [...v].filter((c) => c >= "0" && c <= "9").join("");

/** Add or edit one service. */
function ServiceSheet({ service, groupId, groups, stylists, stylistPricing, onClose, onDone }: { service: EditorService | null; groupId: string; groups: EditorGroup[]; stylists: EditorStylist[]; stylistPricing: boolean; onClose: () => void; onDone: (text: string) => void }) {
  const s = service;
  const [name, setName] = useState(s?.name ?? "");
  const [categoryId, setCategoryId] = useState(groupId);
  const [description, setDescription] = useState(s?.description ?? "");
  const [priceType, setPriceType] = useState<PriceType>(s?.priceType ?? "fixed");
  const [price, setPrice] = useState(s ? (s.priceCents / 100).toFixed(s.priceCents % 100 ? 2 : 0) : "");
  const [active, setActive] = useState(String(s?.active ?? 30));
  const [processing, setProcessing] = useState(String(s?.processing ?? 0));
  const [finish, setFinish] = useState(String(s?.finish ?? 0));
  const [bookDuring, setBookDuring] = useState(s?.bookDuringProcessing ?? true);
  const [deposit, setDeposit] = useState<"standard" | "color">(s?.depositCategory ?? "standard");
  const [stage, setStage] = useState<Stage>((STAGES.find((x) => x.key === s?.stage)?.key ?? "cut") as Stage);
  const [online, setOnline] = useState(s?.bookableOnline ?? true);
  const [addOn, setAddOn] = useState(s?.isAddOn ?? false);
  const [who, setWho] = useState<Set<string>>(new Set(s ? offeredBy(stylists, s.id) : stylists.map((x) => x.id)));
  const [own, setOwn] = useState<Record<string, OwnInput>>(() =>
    Object.fromEntries(
      stylists.map((x) => {
        const o = s ? x.own?.[s.id] : undefined;
        return [x.id, { price: o?.price !== undefined ? (o.price / 100).toFixed(o.price % 100 ? 2 : 0) : "", active: o?.active !== undefined ? String(o.active) : "" }];
      }),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const total = asMinutes(active) + asMinutes(processing) + asMinutes(finish);

  const save = () =>
    start(async () => {
      const body: ServiceInput = { name, categoryId, description, priceType, price, active: asMinutes(active), processing: asMinutes(processing), finish: asMinutes(finish), bookDuringProcessing: bookDuring, depositCategory: deposit, stage, bookableOnline: online, isAddOn: addOn };
      const r = await saveService({ id: s?.id ?? null, service: body, offeredBy: [...who], ...(stylistPricing ? { own } : {}) });
      if (r.ok) onDone(s ? `Saved ${name.trim()}.` : `Added ${name.trim()}.`);
      else setError(r.error);
    });
  const archive = () =>
    s &&
    confirm(`Archive ${s.name}? It comes off the menu and online booking. Past appointments keep it, and you can restore it any time.`) &&
    start(async () => {
      const r = await archiveService(s.id, true);
      if (r.ok) onDone(`Archived ${s.name}.`);
      else setError(r.error);
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={s ? `Edit ${s.name}` : "Add a service"} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{s ? "Edit service" : "Add a service"}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl" aria-label="Close">×</button>
        </div>
        {s?.needsReview && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">This price came from the starting menu. Saving confirms it.</p>}
        <div className="space-y-4">
          <label className="block text-sm">
            Name
            <input className={`${input} mt-1 w-full`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Women's Cut" />
          </label>
          <label className="block text-sm">
            Group
            <select className={`${input} mt-1 w-full`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            Description (shown to clients)
            <textarea className={`${input} mt-1 w-full`} rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold">Price</legend>
            <label className="block text-sm">
              How it&rsquo;s priced
              <select className={`${input} mt-1 w-full`} value={priceType} onChange={(e) => setPriceType(e.target.value as PriceType)}>
                {PRICE_TYPES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            {priceType !== "free" && (
              <label className="block text-sm">
                {priceType === "hourly" ? "Per hour ($)" : priceType === "starting_at" ? "Starting at ($)" : "Price ($)"}
                <input className={`${input} mt-1 w-full`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="35" />
              </label>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">Time{total > 0 ? `: ${mins(total)} in all` : ""}</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <label className="block text-xs">
                Working (min)
                <input className={`${input} mt-1 w-full`} inputMode="numeric" value={active} onChange={(e) => setActive(e.target.value.replace(/\D/g, ""))} />
              </label>
              <label className="block text-xs">
                Processing (min)
                <input className={`${input} mt-1 w-full`} inputMode="numeric" value={processing} onChange={(e) => setProcessing(e.target.value.replace(/\D/g, ""))} />
              </label>
              <label className="block text-xs">
                Finish (min)
                <input className={`${input} mt-1 w-full`} inputMode="numeric" value={finish} onChange={(e) => setFinish(e.target.value.replace(/\D/g, ""))} />
              </label>
            </div>
            <p className="mt-1 text-xs text-muted">Processing is time the client waits (color developing). Finish is the rinse, dry or style after it.</p>
            {asMinutes(processing) > 0 && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={bookDuring} onChange={(e) => setBookDuring(e.target.checked)} /> Another client can be booked during processing
              </label>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Kind (sets the order when services are combined)
              <select className={`${input} mt-1 w-full`} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
                {STAGES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              Deposit rule
              <select className={`${input} mt-1 w-full`} value={deposit} onChange={(e) => setDeposit(e.target.value as "standard" | "color")}>
                <option value="standard">Standard</option>
                <option value="color">Color services</option>
              </select>
            </label>
          </div>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span><span className="font-medium">Clients can book it online</span><span className="block text-muted">Off: only the salon can book it.</span></span>
            <input type="checkbox" className="h-5 w-5" checked={online} onChange={(e) => setOnline(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span><span className="font-medium">Add-on</span><span className="block text-muted">Only booked along with another service (a fee, a treatment).</span></span>
            <input type="checkbox" className="h-5 w-5" checked={addOn} onChange={(e) => setAddOn(e.target.checked)} />
          </label>

          {stylists.length > 0 && (
            <fieldset>
              <legend className="text-sm font-semibold">Who offers it</legend>
              <p className="text-xs text-muted">Only these stylists can be booked for it, online or in the salon.</p>
              {stylistPricing && <p className="text-xs text-muted">Leave a price or time blank to use the menu&rsquo;s{priceType !== "free" && price ? ` ($${price}, ${asMinutes(active)} min working)` : ""}.</p>}
              <div className={`mt-1 grid gap-1 ${stylistPricing ? "" : "sm:grid-cols-2"}`}>
                {stylists.map((x) => (
                  <div key={x.id} className="flex flex-wrap items-center gap-2 py-0.5">
                    <label className="flex min-w-36 flex-1 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={who.has(x.id)}
                        onChange={(e) => setWho((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(x.id);
                          else next.delete(x.id);
                          return next;
                        })}
                      />
                      {x.name}
                    </label>
                    {stylistPricing && who.has(x.id) && (
                      <span className="flex gap-2">
                        {priceType !== "free" && (
                          <input className={`${input} w-24 py-1 text-sm`} inputMode="decimal" placeholder={price ? `$${price}` : "$"} aria-label={`${x.name}'s price`} value={own[x.id]?.price ?? ""} onChange={(e) => setOwn({ ...own, [x.id]: { ...own[x.id], price: e.target.value } })} />
                        )}
                        <input className={`${input} w-24 py-1 text-sm`} inputMode="numeric" placeholder={`${asMinutes(active)} min`} aria-label={`${x.name}'s working minutes`} value={own[x.id]?.active ?? ""} onChange={(e) => setOwn({ ...own, [x.id]: { ...own[x.id], active: digits(e.target.value) } })} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {who.size === 0 && <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Nobody will be able to book this service.</p>}
            </fieldset>
          )}
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="flex-1 rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background disabled:opacity-50" disabled={saving} onClick={save}>
            {saving ? "Saving…" : s ? "Save" : "Add service"}
          </button>
          {s && <button className={small} disabled={saving} onClick={archive}>Archive</button>}
        </div>
      </div>
    </div>
  );
}
