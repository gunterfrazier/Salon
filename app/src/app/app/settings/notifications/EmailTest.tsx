"use client";

import { useState, useTransition } from "react";
import { sendTestEmail, sendTestText } from "./actions";

export default function EmailTest() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="mx-4 rounded-xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Email and texts</h2>
      <p className="text-sm text-muted">Check that client emails and texts are going out. The test text goes to the mobile number on your team record.</p>
      <button
        className="mt-2 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendTestEmail().catch(() => ({ ok: false as const, error: "Couldn't send." }));
            setMsg(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? "Sending…" : "Send me a test email"}
      </button>{" "}
      <button
        className="mt-2 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendTestText().catch(() => ({ ok: false as const, error: "Couldn't send." }));
            setMsg(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? "Sending…" : "Send me a test text"}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}
    </section>
  );
}
