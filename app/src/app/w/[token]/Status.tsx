"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { leave } from "./actions";

export default function Status({ token, name, status, place, wait, withName, phone }: { token: string; name: string; status: string; place: number | null; wait: string; withName: string | null; phone: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [left, setLeft] = useState(false);
  useEffect(() => {
    if (status !== "waiting") return;
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router, status]);

  if (left || status === "left" || status === "cancelled") return <><h1 className="mt-1 font-display text-4xl">You left the line</h1><p className="mt-3 text-muted">Hope to see you another time.</p></>;
  if (status === "in_service") return <><h1 className="mt-1 font-display text-4xl">You&rsquo;re in the chair</h1><p className="mt-3 text-muted">Enjoy, {name}!</p></>;
  if (status === "done") return <><h1 className="mt-1 font-display text-4xl">Thanks, {name}!</h1><p className="mt-3 text-muted">See you next time.</p></>;
  return (
    <>
      <h1 className="mt-1 font-display text-4xl">{place === 1 ? "You're next" : place ? `You're #${place} in line` : "You're in line"}</h1>
      <p className="mt-3 text-2xl">{wait}</p>
      {withName && <p className="mt-1 text-muted">likely with {withName}</p>}
      <p className="mt-6 text-sm text-muted">This page updates on its own. Head to the salon when you&rsquo;re close to the front.</p>
      <div className="mt-6 flex justify-center gap-2">
        {phone && <a href={`tel:${phone}`} className="rounded-full border border-line px-4 py-2 text-sm">Call the salon</a>}
        <button className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50" disabled={pending} onClick={() => confirm("Leave the line?") && start(async () => { const r = await leave(token); if (r.ok) setLeft(true); })}>Leave the line</button>
      </div>
    </>
  );
}
