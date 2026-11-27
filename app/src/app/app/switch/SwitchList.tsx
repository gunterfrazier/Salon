"use client";

import { useState, useTransition } from "react";
import { switchBusiness } from "./actions";

export default function SwitchList({ current, items }: { current: string; items: { id: string; name: string; detail: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {items.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="block font-medium">{m.name}</span>
              <span className="block text-xs text-muted">{m.detail}</span>
            </span>
            {m.id === current ? (
              <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold">Open now</span>
            ) : (
              <button className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50" disabled={pending} onClick={() => start(async () => setError((await switchBusiness(m.id)).error))}>
                Open
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
    </>
  );
}
