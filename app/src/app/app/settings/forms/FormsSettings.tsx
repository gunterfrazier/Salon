"use client";

import { useState, useTransition } from "react";
import { ASK_LABEL, FIELD_LABEL, type Ask, type FieldType, type FormField } from "@/lib/forms/model";
import type { TemplateRow } from "@/lib/forms/server";
import { addStarter, deleteTemplate, saveTemplate } from "./actions";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";
const btn = "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50";
const primary = "rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50";

const BLANK: TemplateRow = { id: "", key: null, name: "", intro: "", fields: [{ id: "q1", type: "text", label: "" }], needs_signature: false, ask: "manual", renew_months: null, active: true, sort: 0 };

export default function FormsSettings({ templates, starters }: { templates: TemplateRow[]; starters: { key: string; name: string; intro: string }[] }) {
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (editing) return <Editor t={editing} onClose={() => setEditing(null)} />;

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <header>
        <h1 className="text-2xl font-bold">Forms</h1>
        <p className="text-sm text-muted">Intake, consultation and consent forms clients fill in and sign on their phone, or on the salon tablet at check-in. When a booking needs one, the client gets a link with their confirmation.</p>
      </header>

      {templates.length === 0 && <p className="rounded-xl border border-line bg-surface p-4 text-sm">No forms yet. Start with the ones below; you can change any wording.</p>}

      {templates.map((t) => (
        <article key={t.id} className="rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{t.name}</h2>
            <span className={`text-sm ${t.active ? "text-green-800 dark:text-green-300" : "text-muted"}`}>{t.active ? "On" : "Off"}</span>
          </div>
          <p className="text-sm text-muted">
            {ASK_LABEL[t.ask]}
            {t.ask !== "manual" ? (t.renew_months ? ` · again every ${t.renew_months} months` : " · once") : ""}
            {` · ${t.fields.filter((f) => f.type !== "heading").length} questions`}
            {t.needs_signature ? " · signed" : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btn} onClick={() => setEditing(t)}>Edit</button>
            <button
              className={btn}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveTemplate({ id: t.id, name: t.name, intro: t.intro ?? "", fields: t.fields, needsSignature: t.needs_signature, ask: t.ask, renewMonths: t.renew_months, active: !t.active });
                  setMsg(r.ok ? null : r.error);
                })
              }
            >
              {t.active ? "Turn off" : "Turn on"}
            </button>
          </div>
        </article>
      ))}

      {msg && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{msg}</p>}

      {starters.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Starter forms</h2>
          <p className="text-sm text-muted">Ready-made wording to start from. Please read the consent wording and change anything that doesn&rsquo;t fit your salon.</p>
          {starters.map((s) => (
            <article key={s.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-muted">{s.intro}</p>
              </div>
              <button
                className={primary}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await addStarter(s.key);
                    setMsg(r.ok ? null : r.error);
                  })
                }
              >
                Add
              </button>
            </article>
          ))}
        </section>
      )}

      <button className={btn} onClick={() => setEditing({ ...BLANK })}>+ New form from scratch</button>
    </main>
  );
}

function Editor({ t, onClose }: { t: TemplateRow; onClose: () => void }) {
  const [name, setName] = useState(t.name);
  const [intro, setIntro] = useState(t.intro ?? "");
  const [fields, setFields] = useState<FormField[]>(t.fields);
  const [sign, setSign] = useState(t.needs_signature);
  const [ask, setAsk] = useState<Ask>(t.ask);
  const [renew, setRenew] = useState<number | null>(t.renew_months);
  const [active, setActive] = useState(t.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const update = (i: number, patch: Partial<FormField>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: -1 | 1) =>
    setFields((fs) => {
      const n = [...fs];
      const j = i + d;
      if (j < 0 || j >= n.length) return fs;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <button className="text-sm text-muted hover:underline" onClick={onClose}>‹ Forms</button>
      <h1 className="text-2xl font-bold">{t.id ? "Edit form" : "New form"}</h1>
      <p className="text-sm text-muted">Changes apply to forms sent from now on. Forms clients already filled in keep the wording they saw.</p>

      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <label className="block text-sm font-medium">
          Name
          <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Short introduction (optional)
          <textarea className={`${input} mt-1`} rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Ask for it
            <select className={`${input} mt-1`} value={ask} onChange={(e) => setAsk(e.target.value as Ask)}>
              {(Object.keys(ASK_LABEL) as Ask[]).map((k) => <option key={k} value={k}>{ASK_LABEL[k]}</option>)}
            </select>
          </label>
          {ask !== "manual" && (
            <label className="text-sm font-medium">
              Ask again
              <select className={`${input} mt-1`} value={renew ?? ""} onChange={(e) => setRenew(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Never (once is enough)</option>
                {[3, 6, 12, 24].map((m) => <option key={m} value={m}>Every {m} months</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-5" checked={sign} onChange={(e) => setSign(e.target.checked)} />
          Client signs it (typed name + drawn signature)
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-5" checked={active} onChange={(e) => setActive(e.target.checked)} />
          On (sent with bookings as set above)
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Questions</h2>
        {fields.map((f, i) => (
          <article key={i} className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Question type" className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" value={f.type} onChange={(e) => update(i, { type: e.target.value as FieldType, options: ["choice", "multi"].includes(e.target.value) ? (f.options?.length ? f.options : ["", ""]) : undefined })}>
                {(Object.keys(FIELD_LABEL) as FieldType[]).map((k) => <option key={k} value={k}>{FIELD_LABEL[k]}</option>)}
              </select>
              {f.type !== "heading" && (
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={!!f.required} onChange={(e) => update(i, { required: e.target.checked })} /> Required
                </label>
              )}
              <span className="flex-1" />
              <button type="button" className={btn} aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
              <button type="button" className={btn} aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
              <button type="button" className={btn} onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}>Remove</button>
            </div>
            <textarea aria-label="Question wording" rows={f.type === "agree" ? 3 : 1} className={input} placeholder={f.type === "heading" ? "Section heading" : f.type === "agree" ? "Statement the client agrees to" : "Question"} value={f.label} onChange={(e) => update(i, { label: e.target.value })} />
            {(f.type === "choice" || f.type === "multi") && (
              <textarea aria-label="Choices, one per line" rows={Math.max(2, f.options?.length ?? 2)} className={input} placeholder="Choices, one per line" value={(f.options ?? []).join("\n")} onChange={(e) => update(i, { options: e.target.value.split("\n") })} />
            )}
            {f.type === "yesno" && <input aria-label="Ask for details on yes" className={input} placeholder="If yes, ask for details (optional), e.g. “Please describe”" value={f.detailsIfYes ?? ""} onChange={(e) => update(i, { detailsIfYes: e.target.value || undefined })} />}
          </article>
        ))}
        <button type="button" className={btn} onClick={() => setFields((fs) => [...fs, { id: "", type: "text", label: "" }])}>+ Add a question</button>
      </section>

      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          className={primary}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveTemplate({ id: t.id || null, name, intro, fields, needsSignature: sign, ask, renewMonths: ask === "manual" ? null : renew, active });
              if (r.ok) onClose();
              else setError(r.error);
            })
          }
        >
          {pending ? "Saving…" : "Save form"}
        </button>
        <button className={btn} onClick={onClose}>Cancel</button>
        {t.id && (
          <button
            className={`${btn} ml-auto text-red-700 dark:text-red-300`}
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete “${t.name}”? Forms clients already filled in are kept.`)) return;
              start(async () => {
                const r = await deleteTemplate(t.id);
                if (r.ok) onClose();
                else setError(r.error);
              });
            }}
          >
            Delete form
          </button>
        )}
      </div>
    </main>
  );
}
