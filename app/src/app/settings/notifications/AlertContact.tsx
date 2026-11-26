"use client";

import { useState, useTransition } from "react";
import { saveAlertContact } from "./actions";

/** Phone/email where the stylist's own alerts (new bookings, day preview) go. */
export default function AlertContact({ phone, email }: { phone: string; email: string }) {
  const [p, setP] = useState(phone);
  const [e, setE] = useState(email);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();
  const input = "rounded-lg border border-line bg-background px-2 py-1.5 text-sm";
  return (
    <section className="mx-auto max-w-3xl px-4">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Send my alerts to</h2>
        <p className="mt-0.5 text-sm text-muted">Your own phone for texts; email is used if there&apos;s no phone.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={input} inputMode="tel" placeholder="Mobile phone" aria-label="Your mobile phone" value={p} onChange={(x) => setP(x.target.value)} />
          <input className={input} inputMode="email" placeholder="Email" aria-label="Your email" value={e} onChange={(x) => setE(x.target.value)} />
          <button
            type="button"
            disabled={saving || (p === phone && e === email)}
            onClick={() => start(async () => {
              const r = await saveAlertContact(p, e);
              setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
            })}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {msg && <p role="status" className={`text-sm ${msg.ok ? "" : "font-semibold"}`}>{msg.text}</p>}
        </div>
      </div>
    </section>
  );
}
