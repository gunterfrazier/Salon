"use server";

import { revalidatePath } from "next/cache";
import { cleanOverrides, ROLES, type Role } from "@/lib/auth/permissions";
import { denied, getContext, type Ctx } from "@/lib/context";

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
