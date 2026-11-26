"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { Answer, Answers, FormField } from "@/lib/forms/model";
import { submitForm } from "./actions";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base";
const W = 600;
const H = 200;

export default function FormFill({ token, firstName, intro, fields, needsSignature, kiosk }: { token: string; firstName: string; intro: string | null; fields: FormField[]; needsSignature: boolean; kiosk: boolean }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [done, setDone] = useState<{ next: string | null } | null>(null);
  const [saving, start] = useTransition();
  const set = (id: string, v: Answer | undefined) =>
    setAnswers((a) => {
      const n = { ...a };
      if (v === undefined) delete n[id];
      else n[id] = v;
      return n;
    });

  if (done) {
    return (
      <section className="mt-4 rounded-2xl border border-line bg-surface p-5" role="status">
        <p className="text-xl font-bold">Thank you{firstName ? `, ${firstName}` : ""}!</p>
        <p className="mt-1 text-muted">Your form was sent to the salon.</p>
        {done.next ? (
          <Link href={`/f/${done.next}${kiosk ? "?kiosk=1" : ""}`} className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent">Next form</Link>
        ) : kiosk ? (
          <>
            <p className="mt-3 font-semibold">All done. Have a seat; we&rsquo;ll be right with you.</p>
            <Link href="/app/kiosk" className="mt-3 inline-block rounded-lg border border-line px-4 py-2">Back to check-in</Link>
          </>
        ) : null}
      </section>
    );
  }

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await submitForm(token, answers, needsSignature ? { name, path } : null).catch(() => ({ ok: false as const, error: "Couldn't send. Check your connection and try again." }));
      if (r.ok) {
        setDone({ next: r.next });
        window.scrollTo({ top: 0 });
      } else {
        setError({ text: r.error, field: "field" in r ? r.field : undefined });
        if ("field" in r && r.field) document.getElementById(`f-${r.field}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

  return (
    <form
      className="mt-2 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {intro && <p className="text-muted">{intro}</p>}
      {fields.map((f) => (
        <Field key={f.id} f={f} value={answers[f.id]} onChange={(v) => set(f.id, v)} bad={error?.field === f.id} />
      ))}

      {needsSignature && (
        <fieldset className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <legend className="px-1 font-semibold">Signature</legend>
          <label className="block text-sm font-medium">
            Your full name
            <input className={`${input} mt-1`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <SignaturePad path={path} onChange={setPath} />
          <p className="text-xs text-muted">By signing, you agree this is your signature and that you&rsquo;ve read this form.</p>
        </fieldset>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{error.text}</p>}
      <button disabled={saving} className="w-full rounded-xl bg-accent py-3 font-semibold text-on-accent disabled:opacity-50">{saving ? "Sending…" : needsSignature ? "Sign and send" : "Send"}</button>
    </form>
  );
}

function Field({ f, value, onChange, bad }: { f: FormField; value: Answer | undefined; onChange: (v: Answer | undefined) => void; bad: boolean }) {
  const wrap = `space-y-1.5 ${bad ? "rounded-xl outline outline-2 outline-red-600 outline-offset-4" : ""}`;
  const label = (
    <>
      <span className="font-medium">{f.label}</span>
      {f.required && f.type !== "agree" && <span className="text-red-700 dark:text-red-300"> *</span>}
      {f.help && <span className="block text-sm text-muted">{f.help}</span>}
    </>
  );
  if (f.type === "heading") return <h2 id={`f-${f.id}`} className="border-t border-line pt-4 text-lg font-semibold">{f.label}</h2>;
  if (f.type === "text" || f.type === "long" || f.type === "date") {
    const v = typeof value === "string" ? value : "";
    return (
      <label id={`f-${f.id}`} className={`block ${wrap}`}>
        {label}
        {f.type === "long" ? (
          <textarea className={input} rows={3} value={v} onChange={(e) => onChange(e.target.value || undefined)} />
        ) : (
          <input className={input} type={f.type === "date" ? "date" : "text"} value={v} onChange={(e) => onChange(e.target.value || undefined)} />
        )}
      </label>
    );
  }
  if (f.type === "agree") {
    return (
      <label id={`f-${f.id}`} className={`flex items-start gap-3 ${wrap}`}>
        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--accent)]" checked={value === true} onChange={(e) => onChange(e.target.checked || undefined)} />
        <span>{f.label}</span>
      </label>
    );
  }
  if (f.type === "yesno") {
    const v = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    return (
      <fieldset id={`f-${f.id}`} className={wrap}>
        <legend>{label}</legend>
        <div className="flex gap-2">
          {[true, false].map((yes) => (
            <button key={String(yes)} type="button" aria-pressed={v?.yes === yes} onClick={() => onChange({ yes, details: yes ? v?.details : undefined })} className={`rounded-lg border px-5 py-2 font-semibold ${v?.yes === yes ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}>
              {yes ? "Yes" : "No"}
            </button>
          ))}
        </div>
        {v?.yes && f.detailsIfYes && <input className={input} placeholder={f.detailsIfYes} aria-label={f.detailsIfYes} value={v.details ?? ""} onChange={(e) => onChange({ yes: true, details: e.target.value })} />}
      </fieldset>
    );
  }
  const multi = f.type === "multi";
  const list = Array.isArray(value) ? value : [];
  return (
    <fieldset id={`f-${f.id}`} className={wrap}>
      <legend>{label}</legend>
      <div className="space-y-1">
        {f.options?.map((o) => (
          <label key={o} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
            <input
              type={multi ? "checkbox" : "radio"}
              name={f.id}
              className="size-5 accent-[var(--accent)]"
              checked={multi ? list.includes(o) : value === o}
              onChange={(e) => (multi ? onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o).length ? list.filter((x) => x !== o) : undefined) : onChange(o))}
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Draw with a finger, pen or mouse; saved as SVG path data in a 600×200 box. */
function SignaturePad({ path, onChange }: { path: string; onChange: (p: string) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  // The path so far, kept in a ref so quick strokes don't lose points between renders.
  const current = useRef(path);
  const set = (p: string) => {
    current.current = p;
    onChange(p);
  };
  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * W);
    const y = Math.round(((e.clientY - r.top) / r.height) * H);
    return `${Math.max(0, Math.min(W, x))} ${Math.max(0, Math.min(H, y))}`;
  };
  return (
    <div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Signature box: draw your signature"
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-line bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          set(`${current.current} M ${point(e)} L ${point(e)}`.trim());
        }}
        onPointerMove={(e) => {
          if (drawing.current && current.current.length < 39000) set(`${current.current} L ${point(e)}`);
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      >
        <line x1="20" y1="160" x2="580" y2="160" stroke="#d6d3d1" strokeWidth="2" />
        {path && <path d={path} fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <button type="button" onClick={() => set("")} className="mt-1 text-sm underline">Clear signature</button>
    </div>
  );
}
