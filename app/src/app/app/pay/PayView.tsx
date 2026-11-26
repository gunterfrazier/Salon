"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { PayData, PayRangeKey } from "@/lib/data/pay";
import { money } from "@/lib/format";
import type { PayLine, PayPlan } from "@/lib/pay/compute";
import { formatDay } from "@/lib/time/zone";
import { deleteRent, recordRent, savePayPlan } from "./actions";

const input = "w-full rounded-lg border border-line bg-background px-3 py-2 text-base";
const btn = "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50";
const RANGES: [PayRangeKey, string][] = [
  ["week", "This week"],
  ["last_week", "Last week"],
  ["month", "This month"],
  ["last_month", "Last month"],
];
const PAY_LABEL: Record<PayPlan["payType"], string> = { none: "Not set (owner or salaried)", commission: "Commission", booth_rent: "Booth rent" };

export default function PayView({ data, range, today, manage, methods }: { data: PayData; range: { key: PayRangeKey; from: string; to: string }; today: string; manage: boolean; methods: { key: string; label: string }[] }) {
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const totalPayout = data.lines.reduce((n, l) => n + l.payout, 0);
  const rentOwed = data.lines.reduce((n, l) => n + l.rentOwed, 0);
  const csv = () => {
    const rows = [["Name", "Pay", "Visits", "Services", "Retail", "Tips", "Commission", "Rent due", "Rent paid", "Rent owed", "Pay out"], ...data.lines.map((l) => [l.name, PAY_LABEL[l.payType], l.visits, ...[l.services, l.retail, l.tips, l.commission, l.rentDue, l.rentPaid, l.rentOwed, l.payout].map((c) => (c / 100).toFixed(2))])];
    const text = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `pay-${range.from}-to-${range.to}.csv`;
    a.click();
  };

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <header>
        <h1 className="text-2xl font-bold">Pay</h1>
        <p className="text-sm text-muted">{manage ? "Commission, tips and booth rent for each person, from completed visits." : "Your commission, tips and booth rent from completed visits."}</p>
      </header>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Dates">
        {RANGES.map(([k, label]) => (
          <Link key={k} href={`/app/pay?range=${k}`} className={`rounded-full border px-3 py-1.5 text-sm ${range.key === k ? "border-accent bg-accent text-on-accent" : "border-line"}`}>{label}</Link>
        ))}
        <span className="flex items-center gap-1 text-sm">
          <input type="date" className="rounded-lg border border-line bg-background px-2 py-1" value={from} max={today} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          –
          <input type="date" className="rounded-lg border border-line bg-background px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          <Link href={`/app/pay?range=custom&from=${from}&to=${to}`} className={btn}>Go</Link>
        </span>
      </nav>
      <p className="text-sm text-muted">
        {formatDay(range.from, { weekday: "short", month: "short", day: "numeric" })} – {formatDay(range.to, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </p>

      {manage && data.lines.length > 1 && (
        <section className="flex flex-wrap gap-4 rounded-xl border border-line bg-surface p-4">
          <p><span className="block text-sm text-muted">Pay out</span><span className="text-2xl font-bold">{money(totalPayout)}</span></p>
          <p><span className="block text-sm text-muted">Booth rent still owed</span><span className="text-2xl font-bold">{money(rentOwed)}</span></p>
          <button className={`${btn} ml-auto self-center`} onClick={csv}>Download CSV</button>
        </section>
      )}

      {data.lines.map((l) => (
        <Person key={l.staffId} l={l} plan={data.plans.find((p) => p.staffId === l.staffId)!} rent={data.rent.filter((r) => r.staffId === l.staffId)} manage={manage} today={today} methods={methods} />
      ))}
      <p className="text-xs text-muted">
        Counted from visits checked out in these dates, by appointment date. Services are the final prices at checkout; package visits count as $0 (the package sale isn&rsquo;t split by stylist). Tips include tips paid with gift cards. Retail sold without a visit isn&rsquo;t credited to anyone.
      </p>
    </main>
  );
}

function Person({ l, plan, rent, manage, today, methods }: { l: PayLine; plan: PayPlan; rent: PayData["rent"]; manage: boolean; today: string; methods: { key: string; label: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [pending, start] = useTransition();
  const row = (label: string, v: number, strong = false) => (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{money(v)}</dd>
    </div>
  );
  return (
    <article className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{l.name}</h2>
        <span className="text-sm text-muted">{PAY_LABEL[l.payType]}</span>
      </div>
      <p className="text-sm text-muted">{l.note}</p>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Visits</dt>
          <dd className="tabular-nums">{l.visits}</dd>
        </div>
        {row("Services", l.services)}
        {l.retail > 0 && row("Retail with visits", l.retail)}
        {row("Tips", l.tips)}
        {l.payType === "commission" && row("Commission", l.commission)}
        {l.payType === "booth_rent" && (
          <>
            {row("Booth rent for these dates", l.rentDue)}
            {row("Rent paid", l.rentPaid)}
            {l.rentOwed > 0 && row("Rent still owed", l.rentOwed, true)}
          </>
        )}
        {l.payType !== "none" && !(l.payType === "booth_rent" && plan.collectsOwn) && row("Pay out", l.payout, true)}
      </dl>

      {manage && l.payType === "booth_rent" && (
        <div className="space-y-1 text-sm">
          {rent.map((r) => (
            <p key={r.id} className="flex flex-wrap items-center gap-2">
              Rent received {formatDay(r.paidOn, { month: "short", day: "numeric" })}: {money(r.cents)} {r.note ? `· ${r.note}` : ""}
              <button className="underline" disabled={pending} onClick={() => start(async () => void (await deleteRent(r.id)))}>Remove</button>
            </p>
          ))}
          {paying ? <RentForm staffId={l.staffId} today={today} methods={methods} suggested={l.rentOwed} onClose={() => setPaying(false)} /> : <button className={btn} onClick={() => setPaying(true)}>Record rent received</button>}
        </div>
      )}

      {manage && (editing ? <PlanForm plan={plan} onClose={() => setEditing(false)} /> : <button className={btn} onClick={() => setEditing(true)}>Change pay plan</button>)}
    </article>
  );
}

function PlanForm({ plan, onClose }: { plan: PayPlan; onClose: () => void }) {
  const [payType, setPayType] = useState(plan.payType);
  const [servicePct, setServicePct] = useState(String(plan.servicePct));
  const [retailPct, setRetailPct] = useState(String(plan.retailPct));
  const [rent, setRent] = useState(plan.rentCents ? (plan.rentCents / 100).toFixed(2) : "");
  const [period, setPeriod] = useState(plan.rentPeriod);
  const [collectsOwn, setCollectsOwn] = useState(plan.collectsOwn);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="space-y-3 rounded-lg border border-line p-3">
      <label className="block text-sm font-medium">
        How {plan.name.split(" ")[0]} is paid
        <select className={`${input} mt-1`} value={payType} onChange={(e) => setPayType(e.target.value as PayPlan["payType"])}>
          {(Object.keys(PAY_LABEL) as PayPlan["payType"][]).map((k) => <option key={k} value={k}>{PAY_LABEL[k]}</option>)}
        </select>
      </label>
      {payType === "commission" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            % of services
            <input type="number" min={0} max={100} step="0.5" className={`${input} mt-1`} value={servicePct} onChange={(e) => setServicePct(e.target.value)} />
          </label>
          <label className="text-sm font-medium">
            % of retail they sell
            <input type="number" min={0} max={100} step="0.5" className={`${input} mt-1`} value={retailPct} onChange={(e) => setRetailPct(e.target.value)} />
          </label>
          <p className="text-xs text-muted sm:col-span-2">They also get 100% of their tips.</p>
        </div>
      )}
      {payType === "booth_rent" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Rent
              <input type="number" inputMode="decimal" min={0} step="0.01" className={`${input} mt-1`} value={rent} onChange={(e) => setRent(e.target.value)} placeholder="0.00" />
            </label>
            <label className="text-sm font-medium">
              Per
              <select className={`${input} mt-1`} value={period} onChange={(e) => setPeriod(e.target.value as "week" | "month")}>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
          </div>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Their clients&rsquo; payments</legend>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={collectsOwn} onChange={() => setCollectsOwn(true)} />
              <span>They collect their own payments and pay the salon rent</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={!collectsOwn} onChange={() => setCollectsOwn(false)} />
              <span>The salon collects payments and pays them out, minus rent</span>
            </label>
          </fieldset>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await savePayPlan(plan.staffId, { payType, servicePct: Number(servicePct || 0), retailPct: Number(retailPct || 0), rentCents: Math.round(Number(rent || 0) * 100), rentPeriod: period, collectsOwn });
              if (r.ok) onClose();
              else setError(r.error);
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button className={btn} onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}

function RentForm({ staffId, today, methods, suggested, onClose }: { staffId: string; today: string; methods: { key: string; label: string }[]; suggested: number; onClose: () => void }) {
  const [amount, setAmount] = useState(suggested ? (suggested / 100).toFixed(2) : "");
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="space-y-2 rounded-lg border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-1">$<input type="number" inputMode="decimal" min={0} step="0.01" className={input} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Rent amount" /></label>
        <select className={input} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Paid with">
          {methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date received" />
      </div>
      <input className={input} placeholder="Note (optional), e.g. week of Dec 7" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await recordRent(staffId, Math.round(Number(amount || 0) * 100), method, date, note);
              if (r.ok) onClose();
              else setError(r.error);
            })
          }
        >
          {pending ? "Saving…" : "Record rent"}
        </button>
        <button className={btn} onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
