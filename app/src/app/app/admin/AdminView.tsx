"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Application } from "@/lib/platform/salons";
import { approveApplication, declineApplication, setSalonStatus } from "./actions";

type App = Application & { decision_note: string | null; business_id: string | null };
type Salon = { id: string; name: string; slug: string; status: string; listed: boolean; place: string; located: boolean };

const btn = "rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50";

function ownerMessage(a: App, slug: string) {
  return `Hi ${a.owner_name.split(" ")[0]}, ${a.salon_name} is approved on Chairvana! Sign in at https://chairvana.app/app/login with ${a.email} (tap "Email me a sign-in link", then set a password in Account). Your booking page: https://chairvana.app/s/${slug}. Start with Salon (address, about), Services (prices) and Team.`;
}

export default function AdminView({ applications, salons, mySalon }: { applications: App[]; salons: Salon[]; mySalon: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string; share?: string } | null>(null);
  const [pending, start] = useTransition();
  const waiting = applications.filter((a) => a.status === "pending");
  const decided = applications.filter((a) => a.status !== "pending");

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Platform</h1>
        <p className="text-sm text-muted">Salon requests and every salon on Chairvana. Public request form: <Link className="underline" href="/join">chairvana.app/join</Link></p>
      </div>
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className="rounded-xl border border-line bg-surface p-3 text-sm">
          <p className={msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}>{msg.text}</p>
          {msg.share && (
            <>
              <p className="mt-2 text-muted">{msg.share}</p>
              <button className="mt-1 text-xs underline" onClick={() => navigator.clipboard.writeText(msg.share!)}>Copy message for the owner</button>
            </>
          )}
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-2 font-semibold">Requests waiting ({waiting.length})</h2>
        {waiting.length === 0 && <p className="px-4 py-3 text-sm text-muted">No requests right now.</p>}
        <ul className="divide-y divide-line">
          {waiting.map((a) => (
            <li key={a.id} className="space-y-1 px-4 py-3 text-sm">
              <p className="font-semibold">{a.salon_name}{a.kind === "solo" && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold">Independent stylist · already using the app</span>}</p>
              <p>{a.owner_name} · {a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
              <p className="text-muted">{[a.street, a.city, a.state, a.zip].filter(Boolean).join(", ")} · {a.stylists ?? "?"} stylist(s) · {a.timezone.replace("America/", "").replace("_", " ")}</p>
              {a.website && <p className="text-muted">{a.website}</p>}
              {a.message && <p className="whitespace-pre-wrap">{a.message}</p>}
              <p className="text-xs text-muted">Sent {new Date(a.created_at).toLocaleDateString()}</p>
              <div className="flex gap-2 pt-1">
                <button
                  className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50"
                  disabled={pending}
                  onClick={() => start(async () => {
                    const r = await approveApplication(a.id);
                    setMsg(r.ok ? { ok: true, text: `${a.salon_name} is live at /s/${r.slug}, with a starter menu (prices marked for review).`, share: ownerMessage(a, r.slug!) } : { ok: false, text: r.error });
                  })}
                >
                  Approve
                </button>
                <button
                  className={btn}
                  disabled={pending}
                  onClick={() => {
                    const note = prompt(`Decline ${a.salon_name}? Optional note for your records:`);
                    if (note === null) return;
                    start(async () => {
                      const r = await declineApplication(a.id, note);
                      setMsg(r.ok ? { ok: true, text: `Declined ${a.salon_name}.` } : { ok: false, text: r.error });
                    });
                  }}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-2 font-semibold">Salons ({salons.length})</h2>
        <ul className="divide-y divide-line">
          {salons.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span>
                <Link href={`/s/${s.slug}`} className="font-medium underline">{s.name}</Link>
                <span className="text-muted"> · {s.place || "no address"}{!s.located ? " · not on the map" : ""}{!s.listed ? " · hidden from search" : ""}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.status === "approved" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>{s.status}</span>
                {s.id !== mySalon && (
                  <button className={btn} disabled={pending} onClick={() => start(async () => {
                    const next = s.status === "suspended" ? "approved" : "suspended";
                    if (next === "suspended" && !confirm(`Suspend ${s.name}? Its page and online booking go offline.`)) return;
                    const r = await setSalonStatus(s.id, next);
                    setMsg(r.ok ? { ok: true, text: `${s.name} is ${next}.` } : { ok: false, text: r.error });
                  })}>
                    {s.status === "suspended" ? "Restore" : "Suspend"}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {decided.length > 0 && (
        <details className="rounded-xl border border-line bg-surface px-4 py-2 text-sm">
          <summary className="cursor-pointer font-semibold">Past requests ({decided.length})</summary>
          <ul className="mt-2 space-y-1">
            {decided.map((a) => (
              <li key={a.id}>{a.salon_name} · {a.status}{a.decision_note ? ` · ${a.decision_note}` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
