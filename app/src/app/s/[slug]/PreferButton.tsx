"use client";

import { useState, useTransition } from "react";
import { savePreferences } from "@/app/me/actions";

/** "Make this my salon" / "Make X my stylist" for signed-in customers. */
export default function PreferButton({ businessId, staffId = null, label, active }: { businessId: string; staffId?: string | null; label: string; active: boolean }) {
  const [on, setOn] = useState(active);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (on) return <span className="text-sm font-semibold">✓ {staffId ? "Your stylist" : "Your salon"}</span>;
  return (
    <span>
      <button
        type="button"
        disabled={pending}
        className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50"
        onClick={() => start(async () => {
          const r = await savePreferences({ businessId, staffId });
          if (r.ok) setOn(true);
          else setErr(r.error);
        })}
      >
        {label}
      </button>
      {err && <span role="alert" className="ml-2 text-xs text-red-700 dark:text-red-300">{err}</span>}
    </span>
  );
}
