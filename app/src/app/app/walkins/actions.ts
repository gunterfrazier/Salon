"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanWalkinSettings, type WalkinSettings } from "@/lib/walkins/engine";
import { joinLine, startWalkin } from "@/lib/walkins/server";
import { lineBusiness } from "./business";

type Result = { ok: true; text: string } | { ok: false; error: string };

function done() {
  revalidatePath("/app/walkins");
  revalidatePath("/app/calendar");
  revalidatePath("/app/today");
}

export async function addWalkin(input: { name: string; phone: string; serviceIds: string[]; requested: string | null }): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "booking.manage");
  if (no) return no;
  const r = await joinLine(createAdminClient(), await lineBusiness(ctx), { name: input.name, phone: input.phone || null, serviceIds: Array.isArray(input.serviceIds) ? input.serviceIds : [], requested: input.requested || null, source: "desk" });
  if (!r.ok) return r;
  done();
  return { ok: true, text: `${input.name.trim()} is in line.` };
}

/** Start their service with this stylist (or whoever the line predicts). */
export async function startWalk(id: string, staffId: string | null): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "booking.manage");
  if (no) return no;
  const r = await startWalkin(createAdminClient(), await lineBusiness(ctx), id, staffId || null);
  if (!r.ok) return r;
  done();
  return { ok: true, text: `Started with ${r.staffName}. Check them out from the calendar or Today when they're done.` };
}

/** They left, or the desk took them off the line. */
export async function leaveLine(id: string, why: "left" | "cancelled"): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "booking.manage");
  if (no) return no;
  const { error } = await createAdminClient().from("walkins").update({ status: why === "left" ? "left" : "cancelled", finished_at: new Date().toISOString() }).eq("id", id).eq("business_id", ctx.business.id).eq("status", "waiting");
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true, text: "Taken off the line." };
}

/** The salon's walk-in rules. */
export async function saveWalkinSettings(raw: WalkinSettings): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.payments");
  if (no) return no;
  const { error } = await ctx.supabase.from("businesses").update({ walkin_settings: cleanWalkinSettings(raw) }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  done();
  revalidatePath("/s");
  return { ok: true, text: "Walk-in settings saved." };
}
