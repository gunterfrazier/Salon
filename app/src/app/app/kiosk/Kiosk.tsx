"use client";

import { useEffect, useState, useTransition } from "react";
import { kioskCheckIn, kioskLookup, type KioskMatch } from "./actions";

type Step = { kind: "phone" } | { kind: "pick"; matches: KioskMatch[] } | { kind: "none" } | { kind: "done"; name: string; time: string; forms?: { token: string; title: string }[] } | { kind: "error"; text: string };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

function pretty(d: string) {
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Big-button check-in for the waiting area. Resets itself after a short while. */
export default function Kiosk({ salon }: { salon: string }) {
  const [digits, setDigits] = useState("");
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [busy, start] = useTransition();

  // Back to the start after 20 seconds on any result screen, so the next client starts fresh.
  useEffect(() => {
    if (step.kind === "phone") return;
    const t = setTimeout(() => {
      setStep({ kind: "phone" });
      setDigits("");
    }, step.kind === "done" && step.forms?.length ? 60_000 : 20_000);
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
        </>
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
          <p className="text-xl text-muted">Please have a seat and let your stylist know you&apos;re here.</p>
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
