"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { kindLabel, LICENSE_KINDS, US_STATES, type LicenseStatus } from "@/lib/licenses/rules";
import { confirmLicense, deleteLicense, licenseFileUrl, saveLicense, setBlockExpired, startLicenseUpload } from "./actions";

export type LicenseCard = {
  id: string;
  kind: string;
  state: string;
  number: string;
  holderName: string | null;
  expiresOn: string | null;
  hasFile: boolean;
  status: LicenseStatus;
  daysLeft: number | null;
  confirmed: { at: string; note: string | null } | null;
  lookup: string;
};
type Member = { id: string; name: string; role: string; joined: boolean; suspended: boolean; licenses: LicenseCard[] };
type Result = { ok: true } | { ok: false; error: string };

const input = "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-base";
const btn = "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50";
const chip = "rounded-full px-2 py-0.5 text-[11px] font-semibold";

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function StatusChip({ l }: { l: LicenseCard }) {
  if (l.status === "expired") return <span className={`${chip} bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200`}>Expired {l.expiresOn ? day(l.expiresOn) : ""}</span>;
  if (l.status === "soon") return <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>{l.daysLeft === 0 ? "Expires today" : `Expires in ${l.daysLeft} day${l.daysLeft === 1 ? "" : "s"}`}</span>;
  if (l.status === "valid") return <span className={`${chip} bg-background text-muted`}>Good until {day(l.expiresOn!)}</span>;
  return <span className={`${chip} bg-background text-muted`}>No expiration date</span>;
}

/** Licenses: yours, the salon's own, and (for people who manage the team) everyone's. */
export default function LicensesView({ salon, mine, salonLicenses, canEditSalon, manage, blockExpired, team }: { salon: string; mine: LicenseCard[]; salonLicenses: LicenseCard[]; canEditSalon: boolean; manage: boolean; blockExpired: boolean; team: Member[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ target: "me" | "salon"; l: LicenseCard | null } | null>(null);

  const run = (fn: () => Promise<Result>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  const view = (id: string) =>
    start(async () => {
      const r = await licenseFileUrl(id);
      if (r.ok) window.open(r.url, "_blank", "noopener");
      else setMsg({ ok: false, text: r.error });
    });

  const missing = team.filter((m) => m.joined && !m.suspended && !m.licenses.length);
  const lapsed = team.filter((m) => !m.suspended && m.licenses.some((l) => l.status === "expired") && !m.licenses.some((l) => l.status === "valid" || l.status === "soon"));

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Licenses</h1>
        <p className="text-sm text-muted">Keep licenses on file and get reminders 90, 60, 30 and 7 days before they expire. Files are private: only you, and the salons you work at, can open yours.</p>
      </header>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-line bg-surface" : "border-red-300 bg-red-50 font-semibold text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"}`}>{msg.text}</p>}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Your licenses</h2>
          <button className={btn} disabled={pending} onClick={() => setEditing({ target: "me", l: null })}>Add a license</button>
        </div>
        {mine.length ? (
          <ul className="space-y-2">{mine.map((l) => <Card key={l.id} l={l} pending={pending} onView={view} onEdit={() => setEditing({ target: "me", l })} onDelete={() => confirm("Delete this license from Chairvana?") && run(() => deleteLicense(l.id), "License deleted.")} confirmedLabel={salon} />)}</ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">No license on file yet. Add yours with a photo of it, and you&rsquo;ll get renewal reminders.</p>
        )}
      </section>

      {(canEditSalon || salonLicenses.length > 0) && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{salon}&rsquo;s license</h2>
            {canEditSalon && <button className={btn} disabled={pending} onClick={() => setEditing({ target: "salon", l: null })}>Add the salon license</button>}
          </div>
          {salonLicenses.length ? (
            <ul className="space-y-2">{salonLicenses.map((l) => <Card key={l.id} l={l} pending={pending} onView={view} onEdit={canEditSalon ? () => setEditing({ target: "salon", l }) : undefined} onDelete={canEditSalon ? () => confirm("Delete the salon license from Chairvana?") && run(() => deleteLicense(l.id), "License deleted.") : undefined} />)}</ul>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">The salon&rsquo;s establishment license isn&rsquo;t on file.</p>
          )}
        </section>
      )}

      {manage && (
        <section className="space-y-3">
          <h2 className="font-semibold">Team</h2>
          <label className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
            <span>
              <span className="font-medium">Don&rsquo;t book stylists whose license has expired</span>
              <span className="block text-muted">They come off online booking and New appointment until they add their renewed license. Booked appointments stay.</span>
            </span>
            <input type="checkbox" className="mt-1 h-5 w-5" disabled={pending} checked={blockExpired} onChange={(e) => run(() => setBlockExpired(e.target.checked), e.target.checked ? "Expired licenses now stop booking." : "Expired licenses no longer stop booking.")} />
          </label>
          {(missing.length > 0 || lapsed.length > 0) && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {lapsed.length > 0 && <><strong>Expired:</strong> {lapsed.map((m) => m.name).join(", ")}. </>}
              {missing.length > 0 && <><strong>No license on file:</strong> {missing.map((m) => m.name).join(", ")}.</>}
            </p>
          )}
          {team.length === 0 && <p className="text-sm text-muted">No one else on the team yet.</p>}
          <ul className="space-y-3">
            {team.map((m) => (
              <li key={m.id} className="rounded-xl border border-line bg-surface p-3">
                <p className="font-medium">{m.name} <span className="text-xs font-normal text-muted">· {m.role}{m.suspended ? " · suspended" : ""}</span></p>
                {!m.joined ? (
                  <p className="text-sm text-muted">Hasn&rsquo;t signed in yet. They add their license once they do.</p>
                ) : m.licenses.length ? (
                  <ul className="mt-2 space-y-2">
                    {m.licenses.map((l) => (
                      <Card key={l.id} l={l} pending={pending} onView={view} confirmedLabel={salon}>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <a className={btn} href={l.lookup} target="_blank" rel="noreferrer">Find the {l.state} board&rsquo;s lookup</a>
                          {l.confirmed ? (
                            <button className={btn} disabled={pending} onClick={() => run(() => confirmLicense(l.id, false, ""), "Confirmation removed.")}>Undo confirmed</button>
                          ) : (
                            <button
                              className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-semibold text-background disabled:opacity-50"
                              disabled={pending}
                              onClick={() => {
                                const note = prompt(`Confirm ${m.name}'s ${l.state} license ${l.number}? Check it on the state board's lookup first. Note (optional, e.g. "Checked on board site"):`, "Checked on the state board's lookup");
                                if (note !== null) run(() => confirmLicense(l.id, true, note), `${m.name}'s license is confirmed.`);
                              }}
                            >
                              Confirm
                            </button>
                          )}
                        </div>
                      </Card>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No license on file.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <LicenseSheet
          key={editing.l?.id ?? `new-${editing.target}`}
          target={editing.target}
          l={editing.l}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMsg({ ok: true, text });
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function Card({ l, pending, onView, onEdit, onDelete, confirmedLabel, children }: { l: LicenseCard; pending: boolean; onView: (id: string) => void; onEdit?: () => void; onDelete?: () => void; confirmedLabel?: string; children?: React.ReactNode }) {
  return (
    <li className={`rounded-xl border bg-surface p-3 ${l.status === "expired" ? "border-red-300 dark:border-red-800" : l.status === "soon" ? "border-amber-300 dark:border-amber-800" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{l.state} {kindLabel(l.kind)} · <span className="font-mono">{l.number}</span></p>
          {l.holderName && <p className="text-xs text-muted">{l.holderName}</p>}
          <p className="mt-1 flex flex-wrap gap-1">
            <StatusChip l={l} />
            {confirmedLabel && (l.confirmed ? <span className={`${chip} bg-accent/20`}>Confirmed by {confirmedLabel}</span> : <span className={`${chip} bg-background text-muted`}>Not confirmed by {confirmedLabel} yet</span>)}
          </p>
        </div>
        <span className="flex flex-wrap gap-1">
          {l.hasFile && <button className={btn} disabled={pending} onClick={() => onView(l.id)}>View</button>}
          {onEdit && <button className={btn} disabled={pending} onClick={onEdit}>{l.status === "expired" || l.status === "soon" ? "Renewed? Update" : "Edit"}</button>}
          {onDelete && <button className={btn} disabled={pending} onClick={onDelete}>Delete</button>}
        </span>
      </div>
      {children}
    </li>
  );
}

function LicenseSheet({ target, l, onClose, onSaved }: { target: "me" | "salon"; l: LicenseCard | null; onClose: () => void; onSaved: (text: string) => void }) {
  const salon = target === "salon";
  const kinds = LICENSE_KINDS.filter((k) => (salon ? k.key === "establishment" : k.key !== "establishment"));
  const [kind, setKind] = useState(l?.kind ?? kinds[0].key);
  const [state, setState] = useState(l?.state ?? "AL");
  const [number, setNumber] = useState(l?.number ?? "");
  const [holder, setHolder] = useState(l?.holderName ?? "");
  const [expires, setExpires] = useState(l?.expiresOn ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const save = () =>
    start(async () => {
      let uploaded: { path: string; type: string } | null = null;
      if (file) {
        const type = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
        const s = await startLicenseUpload(target, type, file.size);
        if (!s.ok) return setError(s.error);
        const put = await fetch(s.url, { method: "PUT", body: file, headers: { "content-type": type } }).catch(() => null);
        if (!put?.ok) return setError("The upload didn't finish. Check the connection and try again.");
        uploaded = { path: s.path, type };
      }
      const r = await saveLicense({ id: l?.id ?? null, target, license: { kind, state, number, holderName: holder, expiresOn: expires }, file: uploaded });
      if (r.ok) onSaved(l ? "License updated." : "License added. You'll get reminders before it expires.");
      else setError(r.error);
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={l ? "Edit license" : "Add a license"} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{l ? "Edit license" : salon ? "Add the salon license" : "Add a license"}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl" aria-label="Close">×</button>
        </div>
        <div className="space-y-3">
          {!salon && (
            <label className="block text-sm">
              Type
              <select className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
                {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <label className="block text-sm">
              State
              <select className={input} value={state} onChange={(e) => setState(e.target.value)}>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              License number
              <input className={`${input} font-mono`} value={number} maxLength={40} onChange={(e) => setNumber(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            Name on the license
            <input className={input} value={holder} maxLength={100} onChange={(e) => setHolder(e.target.value)} />
          </label>
          <label className="block text-sm">
            Expires
            <input type="date" className={input} value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <label className="block text-sm">
            {l?.hasFile ? "Replace the photo or PDF (optional)" : "Photo or PDF of the license"}
            <input type="file" accept="image/*,application/pdf" className={input} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {l && <p className="text-xs text-muted">Changing the number, date or file asks the salons you work at to confirm it again.</p>}
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
        <button className="mt-4 w-full rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background disabled:opacity-50" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
