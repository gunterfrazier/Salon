import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { ensureBusinessFor } from "../setup/bootstrap";

/** A salon's client record that belongs to this customer. */
export interface ClientLink {
  clientId: string;
  businessId: string;
}

export type Who =
  | { kind: "staff"; user: User; businessId: string }
  | { kind: "customer"; user: User; customerId: string; links: ClientLink[] }
  | { kind: "none"; user: User }
  | { kind: "signed_out" };

/**
 * Who is signed in: a salon team member (staff record) or a customer (an
 * account of their own, linked to each salon's client record by verified email).
 */
export async function whoAmI(): Promise<Who> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "signed_out" };

  const businessId = await ensureBusinessFor(user);
  if (businessId) return { kind: "staff", user, businessId };

  const c = await linkedCustomer(user);
  if (c) return { kind: "customer", user, ...c };
  return { kind: "none", user };
}

/**
 * The customer account for a signed-in user. Created on first sign-in when
 * they signed up or any salon has a client record with their email; links
 * every such client record. Only verified emails link records.
 */
export async function linkedCustomer(user: User): Promise<{ customerId: string; links: ClientLink[] } | null> {
  const db = createAdminClient();
  const email = user.email?.toLowerCase() ?? null;
  const verified = !!email && !!user.email_confirmed_at;

  let { data: cust } = await db.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (!cust && verified) {
    // Signed up before signing in (or a salon added them): claim that account.
    const { data: byEmail } = await db.from("customers").select("id").ilike("email", email!).is("auth_user_id", null).maybeSingle();
    if (byEmail) {
      await db.from("customers").update({ auth_user_id: user.id }).eq("id", byEmail.id);
      cust = byEmail;
    }
  }
  if (!cust && verified) {
    // A salon's client who never signed up: make their account from the newest record.
    const { data: rec } = await db.from("clients").select("first_name,last_name,phone,sms_opt_in").ilike("email", email!).order("created_at", { ascending: false }).limit(1);
    if (rec?.length) {
      const { data: created } = await db
        .from("customers")
        .insert({ auth_user_id: user.id, email: email!, first_name: rec[0].first_name, last_name: rec[0].last_name, phone: rec[0].phone, sms_opt_in: rec[0].sms_opt_in })
        .select("id")
        .single();
      cust = created;
    }
  }
  if (!cust) return null;

  // Link client records with this verified email (in any salon) that aren't linked yet.
  if (verified) {
    await db.from("clients").update({ customer_id: cust.id, auth_user_id: user.id }).ilike("email", email!).is("customer_id", null);
  }
  const { data: recs } = await db.from("clients").select("id,business_id").eq("customer_id", cust.id);
  return { customerId: cust.id, links: (recs ?? []).map((r) => ({ clientId: r.id, businessId: r.business_id })) };
}

/** Whether an email belongs to someone who may sign in: an owner, an active team member, a client, or a customer. */
export async function mayHaveAccount(email: string, isOwner: boolean): Promise<boolean> {
  if (isOwner) return true;
  const admin = createAdminClient();
  const [staff, clients, customers] = await Promise.all([
    admin.from("staff").select("id").ilike("email", email).eq("active", true).limit(1),
    admin.from("clients").select("id").ilike("email", email).limit(1),
    admin.from("customers").select("id").ilike("email", email).limit(1),
  ]);
  return !!staff.data?.length || !!clients.data?.length || !!customers.data?.length;
}
