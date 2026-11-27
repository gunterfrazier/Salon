"use client";

/* eslint-disable @next/next/no-img-element -- brand mark */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { showCode } from "@/lib/screens/pairing";

/** The TV's side of pairing: get a code, show it big, check every few seconds until someone enters it. */
export default function PairTv() {
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; secret: string } | null>(null);
  const [state, setState] = useState<"waiting" | "paired" | "error">("waiting");
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    fetch("/api/screens/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start" }) })
      .then((r) => r.json())
      .then((j) => live && (j.code ? setCode({ code: j.code, secret: j.secret }) : setState("error")))
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [round]);

  useEffect(() => {
    if (!code) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/screens/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "poll", ...code }) });
        const j = await r.json();
        if (j.paired) {
          clearInterval(t);
          setState("paired");
          router.refresh();
        } else if (j.expired) {
          clearInterval(t);
          setCode(null);
          setRound((n) => n + 1);
        }
      } catch {
        /* offline for a moment: keep trying */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [code, router]);

  return (
    <main className="brand-dark flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
      <img src="/brand/mark-ivory.png" alt="" className="h-16 w-auto" />
      <h1 className="font-display text-4xl sm:text-5xl">Set up this screen</h1>
      {state === "paired" ? (
        <p className="text-2xl">Paired. Starting…</p>
      ) : state === "error" ? (
        <>
          <p className="text-xl text-muted">Couldn&rsquo;t get a code. Check the internet connection.</p>
          <button className="rounded-full border border-line px-6 py-3 text-xl" onClick={() => { setState("waiting"); setRound((n) => n + 1); }}>Try again</button>
        </>
      ) : (
        <>
          <p className="max-w-xl text-xl text-muted sm:text-2xl">On your phone, open Chairvana → <strong className="text-foreground">Screens</strong> → pick a screen → <strong className="text-foreground">Pair a TV</strong>, and enter this code:</p>
          <p className="rounded-3xl border border-line bg-surface px-10 py-6 font-mono text-6xl tracking-[0.2em] sm:text-8xl" aria-live="polite">{code ? showCode(code.code) : "· · ·"}</p>
          <p className="text-base text-muted">The code changes every 15 minutes. This page updates by itself once it&rsquo;s paired.</p>
        </>
      )}
    </main>
  );
}
