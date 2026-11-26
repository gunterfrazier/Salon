"use client";

import { useState, useTransition } from "react";
import { answerText, flagsFrom, type Answers, type FormField } from "@/lib/forms/model";
import { startForm, voidForm } from "./forms-actions";

export interface ClientFormItem {
  id: string;
  token: string;
  title: string;
  status: "pending" | "completed" | "void";
  createdAt: string;
  completedAt: string | null;
  fields: FormField[];
  answers: Answers | null;
  signature: { name: string; path: string } | null;
}

const btn = "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50";
const day = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });

/** Forms on a client's profile: filled in, waiting, and sending a new one. */
export default function ClientForms({ clientId, forms, templates, canEdit, tz }: { clientId: string; forms: ClientFormItem[]; templates: { id: string; name: string }[]; canEdit: boolean; tz: string }) {
  const [pick, setPick] = useState(templates[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = forms.filter((f) => f.status !== "void");
  const flags = forms.filter((f) => f.status === "completed" && f.answers).flatMap((f) => flagsFrom(f.fields, f.answers!).map((t) => `${f.title}: ${t}`));
  if (!shown.length && !templates.length) return null;

  const go = (how: "send" | "here") =>
    start(async () => {
      setMsg(null);
      const r = await startForm(clientId, pick, how);
      if (!r.ok) return setMsg(r.error);
      if (how === "here") window.open(`/f/${r.token}?kiosk=1`, "_blank");
      else setMsg(r.note ?? "Link sent.");
    });

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4" aria-label="Forms">
      <h2 className="font-semibold">Forms</h2>
      {flags.length > 0 && (
        <ul className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          {flags.map((f) => <li key={f}>⚠ {f}</li>)}
        </ul>
      )}
      {!shown.length && <p className="text-sm text-muted">No forms yet.</p>}
      <ul className="divide-y divide-line">
        {shown.map((f) => <FormRow key={f.id} f={f} clientId={clientId} canEdit={canEdit} tz={tz} />)}
      </ul>
      {canEdit && templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <select aria-label="Form" className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className={btn} disabled={pending || !pick} onClick={() => go("send")}>Text/email the link</button>
          <button className={btn} disabled={pending || !pick} onClick={() => go("here")}>Fill in on this device</button>
        </div>
      )}
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </section>
  );
}

function FormRow({ f, clientId, canEdit, tz }: { f: ClientFormItem; clientId: string; canEdit: boolean; tz: string }) {
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  if (f.status === "pending") {
    const link = `${typeof window === "undefined" ? "" : window.location.origin}/f/${f.token}`;
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span>
          <span className="font-medium">{f.title}</span> <span className="text-sm text-muted">· waiting since {day(f.createdAt, tz)}</span>
        </span>
        {canEdit && (
          <span className="flex flex-wrap gap-2">
            <button className={btn} onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
            <a className={btn} href={`/f/${f.token}?kiosk=1`} target="_blank" rel="noreferrer">Fill in here</a>
            <button className={btn} disabled={pending} onClick={() => start(async () => void (await voidForm(clientId, f.id)))}>Cancel</button>
          </span>
        )}
      </li>
    );
  }
  return (
    <li className="py-2">
      <details>
        <summary className="cursor-pointer">
          <span className="font-medium">{f.title}</span> <span className="text-sm text-muted">· filled in {day(f.completedAt!, tz)}</span>
        </summary>
        <dl className="mt-2 space-y-2 text-sm">
          {f.fields.map((q) =>
            q.type === "heading" ? (
              <dt key={q.id} className="pt-2 font-semibold">{q.label}</dt>
            ) : (
              <div key={q.id}>
                <dt className="text-muted">{q.label}</dt>
                <dd>{answerText(q, f.answers?.[q.id])}</dd>
              </div>
            ),
          )}
        </dl>
        {f.signature && (
          <figure className="mt-3">
            <svg viewBox="0 0 600 200" className="h-24 w-full max-w-sm rounded border border-line bg-white" role="img" aria-label={`Signature of ${f.signature.name}`}>
              <path d={f.signature.path} fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <figcaption className="text-sm text-muted">Signed by {f.signature.name}, {new Date(f.completedAt!).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })}</figcaption>
          </figure>
        )}
        <button className={`${btn} mt-2 print:hidden`} onClick={() => window.print()}>Print</button>
      </details>
    </li>
  );
}
