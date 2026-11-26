"use client";

import { useState, useTransition } from "react";
import { PERMISSIONS, permissionsFor, ROLE_DEFAULTS, ROLES, roleLabel, type Permission, type Role, type RoleOverrides } from "@/lib/auth/permissions";
import { addTeamMember, saveRolePermissions, updateTeamMember } from "./actions";

interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  active: boolean;
  /** Has signed in at least once. */
  joined: boolean;
}

const input = "rounded-lg border border-line bg-background px-3 py-2 text-base";
const btn = "rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50";
const EDITABLE: Role[] = ["manager", "stylist", "front_desk", "renter"];

export default function TeamView({ me, isOwner, salon, members, overrides }: { me: string; isOwner: boolean; salon: string; members: Member[]; overrides: RoleOverrides }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: r.error });
    });
  const roleChoices = ROLES.filter((r) => isOwner || r.key !== "owner");
  const active = members.filter((m) => m.active);
  const off = members.filter((m) => !m.active);

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-muted">Who can sign in to {salon}, and what each role can do.</p>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl border border-line bg-surface p-3 text-sm ${msg.ok ? "" : "font-semibold text-red-700 dark:text-red-300"}`}>{msg.text}</p>}

      <section className="rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-2 font-semibold">People ({active.length})</h2>
        <ul className="divide-y divide-line">
          {active.map((m) => (
            <MemberRow key={m.id} m={m} me={me} roleChoices={roleChoices} isOwner={isOwner} pending={pending} run={run} salon={salon} />
          ))}
        </ul>
        {off.length > 0 && (
          <details className="border-t border-line px-4 py-2 text-sm">
            <summary className="cursor-pointer">Turned off ({off.length})</summary>
            <ul className="mt-2 space-y-1">
              {off.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span>{m.name} · {roleLabel(m.role)}</span>
                  <button className={btn} disabled={pending} onClick={() => run(() => updateTeamMember(m.id, { active: true }), `${m.name} can sign in again.`)}>Turn back on</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <AddMember roleChoices={roleChoices} pending={pending} run={run} salon={salon} />
      <RoleMatrix overrides={overrides} isOwner={isOwner} />
    </main>
  );
}

function inviteText(salon: string, name: string, email: string) {
  return `Hi ${name.split(" ")[0]}, you've been added to ${salon} on Chairvana. Sign in at https://chairvana.app/login with ${email}: tap "Email me a sign-in link", then set a password in Account.`;
}

function ShareInvite({ salon, name, email }: { salon: string; name: string; email: string }) {
  const [copied, setCopied] = useState(false);
  const text = inviteText(salon, name, email);
  return (
    <button
      type="button"
      className="text-xs underline"
      onClick={async () => {
        if (navigator.share) {
          try {
            await navigator.share({ text });
            return;
          } catch {
            /* fall back to copy */
          }
        }
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {copied ? "Invite copied" : "Send invite"}
    </button>
  );
}

function MemberRow({ m, me, roleChoices, isOwner, pending, run, salon }: { m: Member; me: string; roleChoices: typeof ROLES; isOwner: boolean; pending: boolean; run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok?: string) => void; salon: string }) {
  const lockedOwner = m.role === "owner" && !isOwner;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <p className="font-medium">
          {m.name}
          {m.id === me && <span className="text-muted"> (you)</span>}
        </p>
        <p className="text-xs text-muted">
          {m.email ?? "No email"}
          {m.phone ? ` · ${m.phone}` : ""}
          {!m.joined && " · hasn't signed in yet"}
        </p>
        {!m.joined && m.email && <ShareInvite salon={salon} name={m.name} email={m.email} />}
      </div>
      <select
        className={input}
        value={m.role}
        disabled={pending || lockedOwner}
        aria-label={`${m.name}'s role`}
        onChange={(e) => run(() => updateTeamMember(m.id, { role: e.target.value }), `${m.name} is now ${roleLabel(e.target.value)}.`)}
      >
        {(lockedOwner ? ROLES.filter((r) => r.key === "owner") : roleChoices).map((r) => (
          <option key={r.key} value={r.key}>{r.label}</option>
        ))}
      </select>
      {m.id !== me && !lockedOwner && (
        <button className={btn} disabled={pending} onClick={() => confirm(`Turn off ${m.name}? They won't be able to sign in. Their history stays.`) && run(() => updateTeamMember(m.id, { active: false }), `${m.name} is turned off.`)}>
          Turn off
        </button>
      )}
    </li>
  );
}

function AddMember({ roleChoices, pending, run, salon }: { roleChoices: typeof ROLES; pending: boolean; run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok?: string) => void; salon: string }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "stylist" });
  const [added, setAdded] = useState<{ name: string; email: string } | null>(null);
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Add a team member</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} placeholder="Name" aria-label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={input} placeholder="Email (they sign in with this)" aria-label="Email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input className={input} placeholder="Mobile (optional)" aria-label="Mobile" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <select className={input} value={f.role} aria-label="Role" onChange={(e) => setF({ ...f, role: e.target.value })}>
          {roleChoices.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted">{ROLES.find((r) => r.key === f.role)?.description}</p>
      <button
        className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50"
        disabled={pending || !f.name.trim() || !f.email.trim()}
        onClick={() => {
          const who = { name: f.name.trim(), email: f.email.trim().toLowerCase() };
          run(async () => {
            const r = await addTeamMember(f);
            if (r.ok) {
              setAdded(who);
              setF({ name: "", email: "", phone: "", role: f.role });
            }
            return r;
          }, `${who.name} was added.`);
        }}
      >
        Add
      </button>
      {added && (
        <div className="rounded-lg bg-background p-3 text-sm">
          <p>Let {added.name} know how to sign in:</p>
          <p className="mt-1 text-muted">{inviteText(salon, added.name, added.email)}</p>
          <ShareInvite salon={salon} name={added.name} email={added.email} />
        </div>
      )}
    </section>
  );
}

function RoleMatrix({ overrides, isOwner }: { overrides: RoleOverrides; isOwner: boolean }) {
  const [o, setO] = useState<RoleOverrides>(overrides);
  const [role, setRole] = useState<Role>("manager");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const has = (role: Role, p: Permission) => permissionsFor(role, o).has(p);
  const flip = (role: Role, p: Permission, on: boolean) => {
    const base = ROLE_DEFAULTS[role].includes(p);
    const next = { ...o, [role]: { ...(o[role] ?? {}) } } as RoleOverrides;
    if (on === base) delete next[role]![p];
    else next[role]![p] = on;
    setO(next);
    setDirty(true);
    setMsg(null);
  };
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))];

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="font-semibold">What each role can do</h2>
      <p className="text-sm text-muted">{isOwner ? "Switch anything on or off. Owners always have everything." : "Only an owner can change these."}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Role">
        {EDITABLE.map((r) => (
          <button key={r} type="button" role="tab" aria-selected={role === r} onClick={() => setRole(r)} className={`rounded-lg px-3 py-1.5 text-sm ${role === r ? "bg-foreground font-semibold text-background" : "border border-line"}`}>
            {roleLabel(r)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">{ROLES.find((x) => x.key === role)?.description}</p>
      {groups.map((g) => (
        <fieldset key={g} className="mt-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">{g}</legend>
          <ul className="mt-1 divide-y divide-line">
            {PERMISSIONS.filter((p) => p.group === g).map((p) => (
              <li key={p.key}>
                <label className="flex cursor-pointer items-start justify-between gap-3 py-2 text-sm">
                  <span>
                    {p.label}
                    {"hint" in p && <span className="block text-xs text-muted">{p.hint}</span>}
                  </span>
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={has(role, p.key)} disabled={!isOwner} onChange={(e) => flip(role, p.key, e.target.checked)} aria-label={`${roleLabel(role)}: ${p.label}`} />
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
      {isOwner && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50"
            disabled={!dirty || saving}
            onClick={() => start(async () => {
              const r = await saveRolePermissions(o);
              setMsg(r.ok ? "Saved. Changes apply the next time each person opens a page." : r.error);
              if (r.ok) setDirty(false);
            })}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button className={btn} disabled={saving} onClick={() => { setO({}); setDirty(true); }}>Back to defaults</button>
          {msg && <p role="status" className="text-sm">{msg}</p>}
        </div>
      )}
    </section>
  );
}
