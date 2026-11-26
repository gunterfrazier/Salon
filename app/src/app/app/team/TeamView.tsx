"use client";

import { useState, useTransition } from "react";
import { PERMISSIONS, permissionsFor, ROLE_DEFAULTS, ROLES, roleLabel, type Permission, type Role, type RoleOverrides } from "@/lib/auth/permissions";
import { addTeamMember, saveRolePermissions, saveStylistSettings, updateTeamMember } from "./actions";
import type { Hours } from "@/lib/context";
import { STYLIST_COLORS } from "@/lib/staff/stylists";

interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  active: boolean;
  /** Has signed in at least once. */
  joined: boolean;
  stylist: { bookable: boolean; title: string; bio?: string; color: string | null; ownColor: string | null; hours: Hours | null; serviceIds: string[] | null };
}

type Svc = { id: string; name: string; category: string };

const input = "rounded-lg border border-line bg-background px-3 py-2 text-base";
const btn = "rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50";
const EDITABLE: Role[] = ["manager", "stylist", "front_desk", "renter"];

export default function TeamView({ me, isOwner, salon, members, overrides, services = [], salonHours = {} }: { me: string; isOwner: boolean; salon: string; members: Member[]; overrides: RoleOverrides; services?: Svc[]; salonHours?: Hours }) {
  const [editing, setEditing] = useState<Member | null>(null);
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
            <MemberRow key={m.id} m={m} me={me} roleChoices={roleChoices} isOwner={isOwner} pending={pending} run={run} salon={salon} onSchedule={() => setEditing(m)} />
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

      {editing && <StylistSheet m={editing} services={services} salonHours={salonHours} onClose={() => setEditing(null)} onSaved={(text) => { setEditing(null); setMsg({ ok: true, text }); }} />}
      <AddMember roleChoices={roleChoices} pending={pending} run={run} salon={salon} />
      <RoleMatrix overrides={overrides} isOwner={isOwner} />
    </main>
  );
}

function inviteText(salon: string, name: string, email: string) {
  return `Hi ${name.split(" ")[0]}, you've been added to ${salon} on Chairvana. Sign in at https://chairvana.app/app/login with ${email}: tap "Email me a sign-in link", then set a password in Account.`;
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

function MemberRow({ m, me, roleChoices, isOwner, pending, run, salon, onSchedule }: { m: Member; me: string; roleChoices: typeof ROLES; isOwner: boolean; pending: boolean; run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok?: string) => void; salon: string; onSchedule: () => void }) {
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
        <p className="text-xs">
          {m.stylist.bookable ? (
            <>
              {m.stylist.color && <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: m.stylist.color }} aria-hidden />}
              Takes appointments{m.stylist.title ? ` · ${m.stylist.title}` : ""}
              {m.stylist.hours ? " · own hours" : ""}
              {m.stylist.serviceIds ? ` · ${m.stylist.serviceIds.length} services` : ""}
            </>
          ) : (
            <span className="text-muted">Doesn&apos;t take appointments</span>
          )}{" "}
          <button type="button" className="underline" onClick={onSchedule}>Schedule &amp; services</button>
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

const DAYS = [["sun", "Sun"], ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"]] as const;

/** Takes appointments, title, color, own hours and services for one team member. */
function StylistSheet({ m, services, salonHours, onClose, onSaved }: { m: Member; services: Svc[]; salonHours: Hours; onClose: () => void; onSaved: (text: string) => void }) {
  const [bookable, setBookable] = useState(m.stylist.bookable);
  const [title, setTitle] = useState(m.stylist.title);
  const [bio, setBio] = useState(m.stylist.bio ?? "");
  const [color, setColor] = useState<string | null>(m.stylist.ownColor);
  const [ownHours, setOwnHours] = useState(!!m.stylist.hours);
  const [hours, setHours] = useState<Hours>(m.stylist.hours ?? salonHours);
  const [allServices, setAllServices] = useState(!m.stylist.serviceIds);
  const [picked, setPicked] = useState<Set<string>>(new Set(m.stylist.serviceIds ?? services.map((x) => x.id)));
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const cats = [...new Set(services.map((x) => x.category))];

  const save = () =>
    start(async () => {
      const r = await saveStylistSettings(m.id, { bookable, title, bio, color, hours: ownHours ? hours : null, serviceIds: allServices ? null : [...picked] });
      if (r.ok) onSaved(`Saved ${m.name}'s schedule and services.`);
      else setError(r.error);
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${m.name}: schedule and services`} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{m.name}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl" aria-label="Close">×</button>
        </div>
        <label className="flex items-center justify-between gap-3 py-2">
          <span className="font-medium">Takes appointments</span>
          <input type="checkbox" className="h-5 w-5" checked={bookable} onChange={(e) => setBookable(e.target.checked)} />
        </label>
        {bookable && (
          <div className="space-y-4">
            <label className="block text-sm">
              Title (shown to clients)
              <input className={`${input} mt-1 w-full`} placeholder="e.g. Color specialist" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block text-sm">
              Short bio (shown on the salon page)
              <textarea className={`${input} mt-1 w-full`} rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
            </label>
            <div>
              <p className="text-sm">Calendar color</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <button type="button" onClick={() => setColor(null)} aria-pressed={color === null} className={`rounded-lg border px-2 py-1 text-xs ${color === null ? "border-foreground font-semibold" : "border-line"}`}>Auto</button>
                {STYLIST_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={color === c} className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} />
                ))}
              </div>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold">Hours</legend>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input type="radio" checked={!ownHours} onChange={() => setOwnHours(false)} /> Same as the salon
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={ownHours} onChange={() => setOwnHours(true)} /> Their own hours
              </label>
              {ownHours && (
                <ul className="mt-2 space-y-1">
                  {DAYS.map(([k, label]) => {
                    const h = hours[k] ?? null;
                    return (
                      <li key={k} className="flex flex-wrap items-center gap-2 text-sm">
                        <label className="flex w-16 items-center gap-1">
                          <input type="checkbox" checked={!!h} onChange={(e) => setHours({ ...hours, [k]: e.target.checked ? (salonHours[k] ?? ["09:00", "17:00"]) : null })} />
                          {label}
                        </label>
                        {h ? (
                          <>
                            <input type="time" className={input} value={h[0]} onChange={(e) => setHours({ ...hours, [k]: [e.target.value, h[1]] })} aria-label={`${label} start`} />
                            <span>to</span>
                            <input type="time" className={input} value={h[1]} onChange={(e) => setHours({ ...hours, [k]: [h[0], e.target.value] })} aria-label={`${label} end`} />
                          </>
                        ) : (
                          <span className="text-muted">Off</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold">Services</legend>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input type="radio" checked={allServices} onChange={() => setAllServices(true)} /> All services
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={!allServices} onChange={() => setAllServices(false)} /> Only these
              </label>
              {!allServices && (
                <div className="mt-2 space-y-2">
                  {cats.map((c) => (
                    <div key={c}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{c}</p>
                      {services.filter((x) => x.category === c).map((x) => (
                        <label key={x.id} className="flex items-center gap-2 py-0.5 text-sm">
                          <input
                            type="checkbox"
                            checked={picked.has(x.id)}
                            onChange={(e) => setPicked((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(x.id);
                              else next.delete(x.id);
                              return next;
                            })}
                          />
                          {x.name}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
        <button className="mt-4 w-full rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background disabled:opacity-50" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
