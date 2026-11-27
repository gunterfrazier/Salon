"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { askToJoin, cancelJoinRequest, searchSalons, redeemCode } from "./actions";

const input = "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base";
const btn = "rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50";
const STATUS: Record<string, string> = { pending: "Waiting for the salon", approved: "Accepted: open it with Switch", declined: "Declined", cancelled: "Cancelled" };

export default function JoinSalonView({ code: initialCode, requests }: { code: string | null; requests: { id: string; status: string; salon: string; at: string }[] }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; place: string }[] | null>(null);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const tried = useRef(false);

  const show = (r: { ok: true; text: string } | { ok: false; error: string }) => setMsg(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.error });

  // Came from a join link (QR code): use the code straight away, once.
  useEffect(() => {
    if (!initialCode || tried.current) return;
    tried.current = true;
    start(async () => show(await redeemCode(initialCode)));
  }, [initialCode]);

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Join a salon</h1>
        <p className="text-sm text-muted">Work at a salon on Chairvana? Join its team and you&rsquo;ll have both: the salon&rsquo;s book, and your own. Switch between them at the top.</p>
      </header>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-line bg-surface" : "border-red-300 bg-red-50 font-semibold text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"}`}>{msg.text}</p>}

      <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Have a join code?</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => show(await redeemCode(code))); }}>
          <input className={`${input} font-mono uppercase tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} placeholder="ABCD2345" aria-label="Join code" autoCapitalize="characters" />
          <button className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50" disabled={pending || code.trim().length < 8}>Join</button>
        </form>
      </section>

      <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Or ask to join</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPicked(null); start(async () => setFound(await searchSalons(q))); }}>
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Salon name" aria-label="Salon name" />
          <button className={btn} disabled={pending || q.trim().length < 2}>Find</button>
        </form>
        {found && !found.length && <p className="text-sm text-muted">No salons found. Check the spelling, or ask the salon for their join code.</p>}
        {found && found.length > 0 && !picked && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {found.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>{s.name}<span className="block text-xs text-muted">{s.place}</span></span>
                <button className={btn} onClick={() => setPicked(s)}>Ask to join</button>
              </li>
            ))}
          </ul>
        )}
        {picked && (
          <div className="space-y-2 rounded-lg bg-background p-3">
            <p className="text-sm">Ask <strong>{picked.name}</strong> to add you to their team. They see your name, email and phone.</p>
            <textarea className={input} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note for the owner (optional)" aria-label="Note" />
            <div className="flex gap-2">
              <button className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50" disabled={pending} onClick={() => start(async () => { const r = await askToJoin(picked.id, note); show(r); if (r.ok) { setPicked(null); setFound(null); setNote(""); } })}>Send request</button>
              <button className={btn} onClick={() => setPicked(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      {requests.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Your requests</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>{r.salon}<span className="block text-xs text-muted">{STATUS[r.status] ?? r.status}</span></span>
                {r.status === "pending" && <button className={btn} disabled={pending} onClick={() => start(async () => show(await cancelJoinRequest(r.id)))}>Cancel</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
