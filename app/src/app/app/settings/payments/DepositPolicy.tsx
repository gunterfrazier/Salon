"use client";

import { useState, useTransition } from "react";
import { saveDepositPolicy } from "./actions";

/** Salon rule: may the team lower or waive a deposit when booking? */
export default function DepositPolicy({ staffCanChange }: { staffCanChange: boolean }) {
  const [on, setOn] = useState(staffCanChange);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, start] = useTransition();
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-lg font-semibold">Deposits</h2>
      <label className="flex cursor-pointer items-start justify-between gap-3 text-sm">
        <span>
          <span className="font-medium">Let the team change or waive a deposit when booking</span>
          <span className="block text-muted">For someone they trust, a team member can lower the amount or book with no deposit. Only people whose access includes &ldquo;Change or waive a deposit&rdquo; (Team page) can do it. Off: every booking follows the deposit rules exactly.</span>
        </span>
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0"
          checked={on}
          disabled={saving}
          onChange={(e) => {
            const v = e.target.checked;
            setOn(v);
            start(async () => {
              const r = await saveDepositPolicy(v);
              setMsg(r.ok ? "Saved." : r.error);
              if (!r.ok) setOn(!v);
            });
          }}
        />
      </label>
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
    </section>
  );
}
