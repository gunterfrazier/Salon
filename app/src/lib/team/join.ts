import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyStaff } from "../notify/events";
import { codeProblem, type JoinRole } from "./codes";

export interface Joiner {
  authUserId: string;
  name: string;
  email: string;
  phone: string | null;
}

/**
 * Put someone on a salon's team (an approved request, or a code that approves
 * itself). Someone turned off before is turned back on; someone already on the
 * team stays as they are. Returns their staff id.
 */
export async function addToTeam(db: SupabaseClient, businessId: string, who: Joiner, role: JoinRole): Promise<{ ok: true; staffId: string; already: boolean } | { ok: false; error: string }> {
  const cols = "id,active,suspended_at,auth_user_id";
  const { data: byLogin } = await db.from("staff").select(cols).eq("business_id", businessId).eq("auth_user_id", who.authUserId).limit(1);
  // Or added by email and never signed in.
  const { data: byEmail } = byLogin?.length ? { data: [] } : await db.from("staff").select(cols).eq("business_id", businessId).ilike("email", who.email).is("auth_user_id", null).limit(1);
  const mine = byLogin?.[0] ?? byEmail?.[0];
  if (mine) {
    if (mine.active && !mine.suspended_at && mine.auth_user_id === who.authUserId) return { ok: true, staffId: mine.id as string, already: true };
    const { error } = await db.from("staff").update({ active: true, auth_user_id: who.authUserId, suspended_at: null, suspended_note: null }).eq("id", mine.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, staffId: mine.id as string, already: false };
  }
  const { data, error } = await db
    .from("staff")
    .insert({
      business_id: businessId,
      auth_user_id: who.authUserId,
      role,
      display_name: who.name,
      email: who.email.toLowerCase(),
      phone: who.phone,
      invited_at: new Date().toISOString(),
      bookable: role === "stylist" || role === "renter",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, staffId: data.id as string, already: false };
}

/** A request to join, and a note to the salon's owner. One pending request per salon. */
export async function createJoinRequest(db: SupabaseClient, businessId: string, who: Joiner, opts: { message?: string | null; codeId?: string | null } = {}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: open } = await db.from("salon_join_requests").select("id").eq("business_id", businessId).eq("auth_user_id", who.authUserId).eq("status", "pending").limit(1);
  if (open?.length) return { ok: true, id: open[0].id as string };
  const { data, error } = await db
    .from("salon_join_requests")
    .insert({ business_id: businessId, auth_user_id: who.authUserId, name: who.name, email: who.email.toLowerCase(), phone: who.phone, message: opts.message?.trim().slice(0, 500) || null, code_id: opts.codeId ?? null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await notifyStaff(businessId, null, "joinRequest", `${who.name} asked to join your team on Chairvana. Accept or decline in Team.`, `join:${data.id}`, () => true);
  return { ok: true, id: data.id as string };
}

/**
 * Use a salon's join code: straight onto the team when the code approves itself,
 * otherwise a request the owner accepts. Counts one use either way.
 */
export async function redeemJoinCode(db: SupabaseClient, code: string, who: Joiner, now = new Date()): Promise<{ ok: true; joined: boolean; salon: string } | { ok: false; error: string }> {
  const { data: c } = await db.from("salon_join_codes").select("id,business_id,role,auto_approve,max_uses,uses,expires_at,revoked_at,businesses(name)").eq("code", code).maybeSingle();
  const why = codeProblem(c, now);
  if (why || !c) return { ok: false, error: why ?? "That code isn't right." };
  const salon = (c.businesses as unknown as { name: string } | null)?.name ?? "the salon";
  // Count the use first (only while uses are left), so a last use can't be taken twice.
  let q = db.from("salon_join_codes").update({ uses: c.uses + 1 }).eq("id", c.id).eq("uses", c.uses);
  if (c.max_uses !== null) q = q.lt("uses", c.max_uses);
  const { data: counted } = await q.select("id");
  if (!counted?.length) return { ok: false, error: "That code was just used. Try again, or ask the salon for a new one." };
  if (c.auto_approve) {
    const r = await addToTeam(db, c.business_id as string, who, c.role as JoinRole);
    if (!r.ok) return r;
    if (!r.already) await notifyStaff(c.business_id as string, null, "joinedTeam", `${who.name} joined your team on Chairvana with a join code.`, `joined:${r.staffId}`, () => true);
    return { ok: true, joined: true, salon };
  }
  const r = await createJoinRequest(db, c.business_id as string, who, { codeId: c.id as string });
  return r.ok ? { ok: true, joined: false, salon } : r;
}
