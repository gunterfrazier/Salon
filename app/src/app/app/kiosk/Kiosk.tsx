"use client";

import { useEffect, useState, useTransition } from "react";
import { kioskCheckIn, kioskJoin, kioskLookup, type KioskMatch } from "./actions";

type Step = { kind: "phone" } | { kind: "pick"; matches: KioskMatch[] } | { kind: "none" } | { kind: "done"; name: string; time: string; forms?: { token: string; title: string }[] } | { kind: "error"; text: string } | { kind: "walkin" } | { kind: "inline"; place: number; wait: string; name: string };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

function pretty(d: string) {
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Big-button check-in for the waiting area. Resets itself after a short while. */
export default function Kiosk({ salon, walkins = false }: { salon: string; walkins?: boolean }) {
  const [digits, setDigits] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [busy, start] = useTransition();

  // Back to the start after 20 seconds on any result screen, so the next client starts fresh.
  useEffect(() => {
    if (step.kind === "phone") return;
    const t = setTimeout(() => {
      setStep({ kind: "phone" });
      setDigits("");
    }, (step.kind === "done" && step.forms?.length) || step.kind === "walkin" ? 60_000 : 20_000);
    return () => clearTimeout(t);
  }, [step]);

  const press = (k: string) => {
    if (k === "⌫") setDigits((d) => d.slice(0, -1));
    else if (k && digits.length < 10) setDigits((d) => d + k);
  };
  const find = () =>
    start(async () => {
      const r = await kioskLookup(digits);
      if (!r.ok) return setStep({ kind: "error", text: r.error });
      const open = r.matches.filter((m) => !m.checkedIn);
      if (r.matches.length && !open.length) return setStep({ kind: "done", name: r.matches[0].name, time: r.matches[0].time });
      setStep(open.length ? { kind: "pick", matches: open } : { kind: "none" });
    });
  const checkIn = (m: KioskMatch) =>
    start(async () => {
      const r = await kioskCheckIn(m.appointmentId, digits);
      setStep(r.ok ? { kind: "done", name: m.name, time: m.time, forms: r.forms } : { kind: "error", text: r.error });
    });
  const join = () =>
    start(async () => {
      const r = await kioskJoin(name, digits);
      setStep(r.ok ? { kind: "inline", place: r.place, wait: r.wait, name } : { kind: "error", text: r.error });
      setName("");
    });
  const reset = () => {
    setDigits("");
    setStep({ kind: "phone" });
  };
  const big = "rounded-2xl text-2xl font-semibold active:scale-95 transition";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <h1 className="text-3xl font-bold">Welcome to {salon}</h1>

      {step.kind === "phone" && (
        <>
          <p className="text-xl">Enter your mobile number to check in</p>
          <p className="h-12 text-4xl font-semibold tabular-nums tracking-wide" aria-live="polite">{pretty(digits) || " "}</p>
          <div className="grid w-full max-w-xs grid-cols-3 gap-3">
            {KEYS.map((k, i) =>
              k ? (
                <button key={i} type="button" onClick={() => press(k)} className={`${big} h-16 border border-line bg-surface`} aria-label={k === "⌫" ? "Delete" : k}>
                  {k}
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
          <button type="button" disabled={digits.length !== 10 || busy} onClick={find} className={`${big} w-full max-w-xs bg-accent px-6 py-4 text-on-accent disabled:opacity-40`}>
            {busy ? "Looking…" : "Find my appointment"}
          </button>
          {walkins && (
            <button type="button" disabled={busy} onClick={() => setStep({ kind: "walkin" })} className={`${big} w-full max-w-xs border border-line bg-surface px-6 py-4`}>
              Walking in? Join the line
            </button>
          )}
        </>
      )}

      {step.kind === "walkin" && (
        <form className="flex w-full max-w-sm flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) join(); }}>
          <p className="text-xl">Your first name</p>
          <input autoFocus className="rounded-2xl border border-line bg-surface px-4 py-4 text-center text-3xl" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Your first name" />
          <p className="text-sm text-muted">{digits.length === 10 ? `We'll use ${pretty(digits)} if we need to reach you.` : "Add your mobile number on the first screen if you'd like a text."}</p>
          <button disabled={busy || !name.trim()} className={`${big} bg-accent px-6 py-4 text-on-accent disabled:opacity-40`}>{busy ? "Adding…" : "Join the line"}</button>
          <button type="button" onClick={reset} className="text-lg text-muted underline">Back</button>
        </form>
      )}

      {step.kind === "inline" && (
        <div className="space-y-3">
          <p className="text-3xl font-semibold">Thanks, {step.name.split(" ")[0]}!</p>
          <p className="text-2xl">{step.place === 1 ? "You're next." : `You're #${step.place} in line.`}</p>
          {step.wait && <p className="text-xl text-muted">Wait: {step.wait}</p>}
          <p className="text-lg">Have a seat. We&rsquo;ll call your name.</p>
          <button type="button" onClick={reset} className={`${big} mt-4 border border-line px-8 py-3`}>Done</button>
        </div>
      )}

      {step.kind === "pick" && (
        <>
          <p className="text-xl">Is this you?</p>
          {step.matches.map((m) => (
            <button key={m.appointmentId} type="button" disabled={busy} onClick={() => checkIn(m)} className={`${big} w-full max-w-md bg-accent px-6 py-5 text-on-accent`}>
              {m.name} · {m.time}
              <span className="block text-base font-normal opacity-90">{m.services.join(", ")}</span>
              <span className="mt-1 block text-lg">I&apos;m here</span>
            </button>
          ))}
          <button type="button" onClick={reset} className="text-lg underline">That&apos;s not me</button>
        </>
      )}

      {step.kind === "done" && (
        <>
          <p className="text-5xl" aria-hidden>✓</p>
          <p className="text-2xl font-semibold">Thanks, {step.name.split(" ")[0]}! You&apos;re checked in for {step.time}.</p>
          {step.forms?.length ? (
            <>
              <p className="text-xl">Before your service, please fill out: <strong>{step.forms.map((f) => f.title).join(", ")}</strong></p>
              <a href={`/f/${step.forms[0].token}?kiosk=1`} className={`${big} bg-accent px-8 py-4 text-on-accent`}>Fill it in now</a>
            </>
          ) : (
            <p className="text-xl text-muted">Have a seat. We&apos;ll be right with you.</p>
          )}
          <button type="button" onClick={reset} className={`${big} border border-line px-6 py-3`}>Done</button>
        </>
      )}

      {step.kind === "none" && (
        <>
          <p className="text-2xl font-semibold">We don&apos;t see an appointment for today with that number.</p>
          {walkins ? (
            <button type="button" onClick={() => setStep({ kind: "walkin" })} className={`${big} bg-accent px-8 py-4 text-on-accent`}>Join the walk-in line</button>
          ) : (
            <p className="text-xl text-muted">Please have a seat and let your stylist know you&apos;re here.</p>
          )}
          <button type="button" onClick={reset} className={`${big} border border-line px-6 py-3`}>Try again</button>
        </>
      )}

      {step.kind === "error" && (
        <>
          <p className="text-2xl font-semibold">{step.text}</p>
          <button type="button" onClick={reset} className={`${big} border border-line px-6 py-3`}>Start over</button>
        </>
      )}
    </main>
  );
}
