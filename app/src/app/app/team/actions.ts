"use server";

import { revalidatePath } from "next/cache";
import { cleanOverrides, ROLES, type Role, cleanPersonal } from "@/lib/auth/permissions";
import { denied, getContext, type Ctx } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanJoinRole, newJoinCode } from "@/lib/team/codes";
import { addToTeam } from "@/lib/team/join";
import { cleanTeamSettings } from "@/lib/team/clients";
import { copyClientsToOwnBusiness, ownBusinessOf } from "@/lib/team/copy";

type Result = { ok: true } | { ok: false; error: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_KEYS = new Set(ROLES.map((r) => r.key));

function done() {
  revalidatePath("/app/team");
}

/** Owner role changes (and editing role permissions) are owner-only. */
const ownerOnly = (ctx: Ctx): Result | null => (ctx.staff.role === "owner" ? null : { ok: false, error: "Only an owner can do this." });

async function activeOwners(ctx: Ctx): Promise<string[]> {
  const { data } = await ctx.supabase.from("staff").select("id").eq("business_id", ctx.business.id).eq("role", "owner").eq("active", true);
  return (data ?? []).map((r) => r.id as string);
}

export async function addTeamMember(input: { name: string; email: string; phone: string; role: string }): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  const name = input.name.trim().slice(0, 80);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!name) return { ok: false, error: "Enter their name." };
  if (!EMAIL.test(email)) return { ok: false, error: "Enter a valid email; it's how they sign in." };
  if (!ROLE_KEYS.has(input.role as Role)) return { ok: false, error: "Pick a role." };
  if (input.role === "owner") {
    const o = ownerOnly(ctx);
    if (o) return o;
  }
  const { data: existing } = await ctx.supabase.from("staff").select("id,active").eq("business_id", ctx.business.id).ilike("email", email).limit(1);
  if (existing?.length) return { ok: false, error: existing[0].active ? "They're already on the team." : "They're on the team but turned off. Turn them back on below." };
  const { error } = await ctx.supabase.from("staff").insert({
    business_id: ctx.business.id,
    display_name: name,
    email,
    phone: input.phone.trim().slice(0, 40) || null,
    role: input.role,
    invited_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

export async function updateTeamMember(id: string, patch: { name?: string; phone?: string; role?: string; active?: boolean }): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  const { data: m } = await ctx.supabase.from("staff").select("id,role,active").eq("business_id", ctx.business.id).eq("id", id).single();
  if (!m) return { ok: false, error: "Team member not found." };
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { ok: false, error: "Enter a name." };
    row.display_name = patch.name.trim().slice(0, 80);
  }
  if (patch.phone !== undefined) row.phone = patch.phone.trim().slice(0, 40) || null;
  const touchesOwner = m.role === "owner" || patch.role === "owner";
  if ((patch.role !== undefined && patch.role !== m.role) || (patch.active !== undefined && touchesOwner)) {
    if (touchesOwner) {
      const o = ownerOnly(ctx);
      if (o) return o;
    }
  }
  if (patch.role !== undefined) {
    if (!ROLE_KEYS.has(patch.role as Role)) return { ok: false, error: "Pick a role." };
    row.role = patch.role;
  }
  if (patch.active !== undefined) {
    if (id === ctx.staff.id && !patch.active) return { ok: false, error: "You can't turn yourself off." };
    row.active = patch.active;
  }
  // Never leave the salon without an active owner.
  if (m.role === "owner" && m.active && (row.role !== undefined && row.role !== "owner" || row.active === false)) {
    const owners = await activeOwners(ctx);
    if (owners.length <= 1) return { ok: false, error: "The salon needs at least one owner. Make someone else an owner first." };
  }
  const { error } = await ctx.supabase.from("staff").update(row).eq("business_id", ctx.business.id).eq("id", id);
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

/** What each role can do (owner always has everything). */
export async function saveRolePermissions(raw: unknown): Promise<Result> {
  const ctx = await getContext();
  const o = ownerOnly(ctx);
  if (o) return o;
  const { error } = await ctx.supabase.from("businesses").update({ role_permissions: cleanOverrides(raw) }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  done();
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Access changes for one person, on top of their role. */
export async function saveMemberPermissions(id: string, raw: unknown): Promise<Result> {
  const ctx = await getContext();
  const o = ownerOnly(ctx);
  if (o) return o;
  const { data: m } = await ctx.supabase.from("staff").select("role").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!m) return { ok: false, error: "Team member not found." };
  if (m.role === "owner") return { ok: false, error: "Owners always have full access." };
  const { error } = await ctx.supabase.from("staff").update({ permissions: cleanPersonal(raw) }).eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export interface StylistSettings {
  bookable: boolean;
  title: string;
  bio?: string;
  color: string | null;
  /** null = the salon's hours. */
  hours: Partial<Record<(typeof DAYS)[number], [string, string] | null>> | null;
  /** null = all services. */
  serviceIds: string[] | null;
}

/** Who takes appointments, and their hours, services, title and calendar color. */
export async function saveStylistSettings(id: string, s: StylistSettings): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  let hours: Record<string, [string, string] | null> | null = null;
  if (s.hours) {
    hours = {};
    for (const d of DAYS) {
      const h = s.hours[d];
      if (!h) {
        hours[d] = null;
        continue;
      }
      if (!HHMM.test(h[0]) || !HHMM.test(h[1]) || h[0] >= h[1]) return { ok: false, error: `Check the hours for ${d[0].toUpperCase()}${d.slice(1)}: start must be before end.` };
      hours[d] = [h[0], h[1]];
    }
  }
  if (s.color !== null && !/^#[0-9a-f]{6}$/i.test(s.color)) return { ok: false, error: "Pick a color." };
  let serviceIds: string[] | null = null;
  if (s.serviceIds) {
    const { data: svc } = await ctx.supabase.from("services").select("id").eq("business_id", ctx.business.id).in("id", s.serviceIds);
    serviceIds = (svc ?? []).map((r) => r.id as string);
    if (!serviceIds.length) return { ok: false, error: "Pick at least one service, or choose All services." };
  }
  const { error } = await ctx.supabase
    .from("staff")
    .update({ bookable: !!s.bookable, title: s.title.trim().slice(0, 60) || null, bio: (s.bio ?? "").trim().slice(0, 500) || null, color: s.color, hours, service_ids: serviceIds })
    .eq("business_id", ctx.business.id)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  done();
  revalidatePath("/app/calendar");
  revalidatePath("/book");
  return { ok: true };
}

// --- Joining the team: requests and join codes -------------------------------

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Accept a stylist's request: they join the team with this role (they keep their own business too). */
export async function acceptJoinRequest(id: string, role: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  if (!UUID_RE.test(id)) return { ok: false, error: "Refresh and try again." };
  const db = createAdminClient();
  const { data: req } = await db.from("salon_join_requests").select("id,auth_user_id,name,email,phone").eq("id", id).eq("business_id", ctx.business.id).eq("status", "pending").maybeSingle();
  if (!req) return { ok: false, error: "That request was already answered." };
  const r = await addToTeam(db, ctx.business.id, { authUserId: req.auth_user_id as string, name: req.name as string, email: req.email as string, phone: (req.phone as string | null) ?? null }, cleanJoinRole(role));
  if (!r.ok) return r;
  await db.from("salon_join_requests").update({ status: "approved", staff_id: r.staffId, decided_at: new Date().toISOString(), decided_by: ctx.staff.id }).eq("id", id);
  done();
  return { ok: true };
}

export async function declineJoinRequest(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  if (!UUID_RE.test(id)) return { ok: false, error: "Refresh and try again." };
  const { error } = await createAdminClient().from("salon_join_requests").update({ status: "declined", decided_at: new Date().toISOString(), decided_by: ctx.staff.id }).eq("id", id).eq("business_id", ctx.business.id).eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

/** A join code to hand a new stylist (or print as a QR code). */
export async function createJoinCode(input: { role: string; autoApprove: boolean; maxUses: number | null; days: number | null; note: string }): Promise<Result & { code?: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  const maxUses = input.maxUses === null ? null : Math.trunc(Number(input.maxUses));
  if (maxUses !== null && !(maxUses >= 1 && maxUses <= 500)) return { ok: false, error: "Uses must be between 1 and 500, or no limit." };
  const days = input.days === null ? null : Math.trunc(Number(input.days));
  if (days !== null && !(days >= 1 && days <= 365)) return { ok: false, error: "Expiry must be 1 to 365 days, or never." };
  for (let i = 0; i < 5; i++) {
    const code = newJoinCode();
    const { error } = await ctx.supabase.from("salon_join_codes").insert({
      business_id: ctx.business.id,
      code,
      role: cleanJoinRole(input.role),
      auto_approve: !!input.autoApprove,
      max_uses: maxUses,
      expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
      note: input.note.trim().slice(0, 80) || null,
      created_by: ctx.staff.id,
    });
    if (!error) {
      done();
      return { ok: true, code };
    }
    if (error.code !== "23505") return { ok: false, error: error.message };
  }
  return { ok: false, error: "Couldn't make a code. Try again." };
}

export async function revokeJoinCode(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  const { error } = await ctx.supabase.from("salon_join_codes").update({ revoked_at: new Date().toISOString() }).eq("business_id", ctx.business.id).eq("id", id).is("revoked_at", null);
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

// --- Suspending (e.g. medical leave) ------------------------------------------

/**
 * Suspend a team member: they can't open the salon and can't be booked, but
 * stay on the team (and won't be billed while suspended, once billing starts).
 * Their upcoming appointments are left for you to move: the count comes back.
 */
export async function suspendMember(id: string, note: string): Promise<Result & { upcoming?: number }> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  if (id === ctx.staff.id) return { ok: false, error: "You can't suspend yourself." };
  const { data: m } = await ctx.supabase.from("staff").select("id,role,active,suspended_at").eq("business_id", ctx.business.id).eq("id", id).single();
  if (!m || !m.active) return { ok: false, error: "Team member not found." };
  if (m.role === "owner") {
    const o = ownerOnly(ctx);
    if (o) return o;
    if ((await activeOwners(ctx)).filter((x) => x !== id).length === 0) return { ok: false, error: "The salon needs at least one owner who isn't suspended." };
  }
  const { error } = await ctx.supabase.from("staff").update({ suspended_at: new Date().toISOString(), suspended_note: note.trim().slice(0, 200) || null }).eq("business_id", ctx.business.id).eq("id", id);
  if (error) return { ok: false, error: error.message };
  const { count } = await ctx.supabase.from("appointments").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).eq("staff_id", id).gte("start_at", new Date().toISOString()).not("status", "in", "(cancelled,no_show,completed)");
  done();
  revalidatePath("/app/calendar");
  return { ok: true, upcoming: count ?? 0 };
}

export async function reinstateMember(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  const { error } = await ctx.supabase.from("staff").update({ suspended_at: null, suspended_note: null }).eq("business_id", ctx.business.id).eq("id", id);
  if (error) return { ok: false, error: error.message };
  done();
  revalidatePath("/app/calendar");
  return { ok: true };
}

// --- Who keeps the clients when someone leaves ---------------------------------

export async function saveTeamSettings(raw: unknown): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  const o = ownerOnly(ctx);
  if (o) return o;
  const { error } = await ctx.supabase.from("businesses").update({ team_settings: cleanTeamSettings(raw) }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

/** Copy a (removed) team member's clients into their own Chairvana business, if they have one. */
export async function copyClientsToMember(id: string): Promise<Result & { text?: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "team.manage");
  if (no) return no;
  const db = createAdminClient();
  const { data: m } = await db.from("staff").select("id,display_name,auth_user_id,active").eq("business_id", ctx.business.id).eq("id", id).maybeSingle();
  if (!m) return { ok: false, error: "Team member not found." };
  if (m.active) return { ok: false, error: "Remove them from the team first." };
  const own = await ownBusinessOf(db, (m.auth_user_id as string | null) ?? null);
  if (!own) return { ok: false, error: `${m.display_name} doesn't have their own business on Chairvana yet. Once they sign up as a stylist (chairvana.app/signup), come back here and copy their clients.` };
  const r = await copyClientsToOwnBusiness(db, ctx.business.id, m.id as string, own.id);
  done();
  return { ok: true, text: `Copied ${m.display_name}'s clients to ${own.name}: ${r.added} added${r.matched ? `, ${r.matched} already there` : ""}, ${r.formulas} color formula${r.formulas === 1 ? "" : "s"}. ${ctx.business.name} keeps its records too.` };
}
