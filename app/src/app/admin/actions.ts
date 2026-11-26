"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import { createSalonFromApplication, isPlatformAdmin, type Application } from "@/lib/platform/salons";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true; slug?: string } | { ok: false; error: string };

async function admin() {
  const ctx = await getContext();
  return isPlatformAdmin(ctx.user.email) ? ctx : null;
}

export async function approveApplication(id: string): Promise<Result> {
  const ctx = await admin();
  if (!ctx) return { ok: false, error: "Only platform admins can do this." };
  const db = createAdminClient();
  const { data: app } = await db.from("salon_applications").select("*").eq("id", id).eq("status", "pending").maybeSingle();
  if (!app) return { ok: false, error: "That request was already handled." };
  // Claim it first so two clicks can't create two salons.
  const { data: claimed } = await db.from("salon_applications").update({ status: "approved", decided_at: new Date().toISOString(), decided_by: ctx.user.email }).eq("id", id).eq("status", "pending").select("id");
  if (!claimed?.length) return { ok: false, error: "That request was already handled." };
  try {
    const salon = await createSalonFromApplication(db, app as Application);
    await db.from("salon_applications").update({ business_id: salon.id }).eq("id", id);
    revalidatePath("/admin");
    return { ok: true, slug: salon.slug };
  } catch (e) {
    await db.from("salon_applications").update({ status: "pending", decided_at: null, decided_by: null }).eq("id", id);
    return { ok: false, error: (e as Error).message };
  }
}

export async function declineApplication(id: string, note: string): Promise<Result> {
  const ctx = await admin();
  if (!ctx) return { ok: false, error: "Only platform admins can do this." };
  const { error } = await createAdminClient()
    .from("salon_applications")
    .update({ status: "declined", decided_at: new Date().toISOString(), decided_by: ctx.user.email, decision_note: note.trim().slice(0, 500) || null })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Suspend (hide and stop booking) or restore a salon. */
export async function setSalonStatus(businessId: string, status: "approved" | "suspended"): Promise<Result> {
  const ctx = await admin();
  if (!ctx) return { ok: false, error: "Only platform admins can do this." };
  if (businessId === ctx.business.id && status === "suspended") return { ok: false, error: "You can't suspend your own salon here." };
  const { error } = await createAdminClient().from("businesses").update({ status }).eq("id", businessId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}
