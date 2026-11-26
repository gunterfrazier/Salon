import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { ensureBusinessFor } from "../setup/bootstrap";

export type Who =
  | { kind: "staff"; user: User; businessId: string }
  | { kind: "client"; user: User; clientId: string; businessId: string }
  | { kind: "none"; user: User }
  | { kind: "signed_out" };

/**
 * Who is signed in: a salon team member (staff record), a client (linked by
 * their verified email the first time they sign in), or neither.
 */
export async function whoAmI(): Promise<Who> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "signed_out" };

  const businessId = await ensureBusinessFor(user);
  if (businessId) return { kind: "staff", user, businessId };

  const client = await linkedClient(user);
  if (client) return { kind: "client", user, ...client };
  return { kind: "none", user };
}

/** The client record for a signed-in client, linking it by verified email on first sign-in. */
export async function linkedClient(user: User): Promise<{ clientId: string; businessId: string } | null> {
  const admin = createAdminClient();
  const { data: linked } = await admin.from("clients").select("id,business_id").eq("auth_user_id", user.id).order("created_at", { ascending: false }).limit(1);
  if (linked?.length) return { clientId: linked[0].id, businessId: linked[0].business_id };
  if (!user.email || !user.email_confirmed_at) return null;
  const { data: byEmail } = await admin.from("clients").select("id,business_id").ilike("email", user.email).is("auth_user_id", null).order("created_at", { ascending: false });
  if (!byEmail?.length) return null;
  await admin.from("clients").update({ auth_user_id: user.id }).in("id", byEmail.map((c) => c.id));
  return { clientId: byEmail[0].id, businessId: byEmail[0].business_id };
}

/** Whether an email belongs to someone who may sign in: an owner, an active team member, or a client. */
export async function mayHaveAccount(email: string, isOwner: boolean): Promise<boolean> {
  if (isOwner) return true;
  const admin = createAdminClient();
  const [staff, clients] = await Promise.all([
    admin.from("staff").select("id").ilike("email", email).eq("active", true).limit(1),
    admin.from("clients").select("id").ilike("email", email).limit(1),
  ]);
  return !!staff.data?.length || !!clients.data?.length;
}
