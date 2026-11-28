"use server";

import { revalidatePath } from "next/cache";
import { getContext, type Ctx } from "@/lib/context";
import { notifySickOffer } from "@/lib/notify/events";
import { markOutSick, offerLink, tellOwners } from "@/lib/sick/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, formatDay, formatTime, isDateStr, todayIn, wallParts, zonedToUtc } from "@/lib/time/zone";

type Result = { ok: true; text: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

/** You can mark yourself out; marking someone else needs team or everyone's-calendar access. */
const mayMark = (ctx: Ctx, staffId: string) => staffId === ctx.staff.id || ctx.can("team.manage") || ctx.can("calendar.all");

function checkRange(ctx: Ctx, from: string, to: string): string | null {
  const today = todayIn(ctx.business.timezone);
  if (!isDateStr(from) || !isDateStr(to)) return "Pick the days.";
  if (from < today) return "The first day can't be in the past.";
  if (to < from) return "The last day must be on or after the first.";
  if (to > addDays(from, 30)) return "Up to 31 days at a time.";
  return null;
}

/** Appointments that would be affected, for the preview. */
export async function affectedAppointments(staffId: string, from: string, to: string): Promise<{ ok: true; list: { id: string; when: string; client: string; services: string }[] } | { ok: false; error: string }> {
  const ctx = await getContext();
  if (!UUID.test(staffId) || !mayMark(ctx, staffId)) return { ok: false, error: "You can only mark yourself out." };
  const bad = checkRange(ctx, from, to);
  if (bad) return { ok: false, error: bad };
  const tz = ctx.business.timezone;
  const { data } = await createAdminClient()
    .from("appointments")
    .select("id,start_at,clients(first_name,last_name),appointment_services(sort,services(name))")
    .eq("business_id", ctx.business.id)
    .eq("staff_id", staffId)
    .in("status", ["pending", "booked", "confirmed"])
    .gte("start_at", new Date(Math.max(zonedToUtc(from, 0, tz).getTime(), Date.now())).toISOString())
    .lt("start_at", zonedToUtc(addDays(to, 1), 0, tz).toISOString())
    .order("start_at");
  type Row = { id: string; start_at: string; clients: { first_name: string; last_name: string | null } | null; appointment_services: { sort: number; services: { name: string } | null }[] };
  return {
    ok: true,
    list: ((data ?? []) as unknown as Row[]).map((a) => ({
      id: a.id,
      when: `${formatDay(wallParts(new Date(a.start_at), tz).date, { weekday: "short", month: "short", day: "numeric" })} ${formatTime(new Date(a.start_at), tz)}`,
      client: [a.clients?.first_name, a.clients?.last_name].filter(Boolean).join(" ") || "Client",
      services: [...a.appointment_services].sort((x, y) => x.sort - y.sort).map((l) => l.services?.name ?? "Service").join(" + "),
    })),
  };
}

export async function markOut(input: { staffId: string; from: string; to: string; reason: string; notify: boolean }): Promise<Result> {
  const ctx = await getContext();
  if (!UUID.test(input.staffId) || !mayMark(ctx, input.staffId)) return { ok: false, error: "You can only mark yourself out." };
  const bad = checkRange(ctx, input.from, input.to);
  if (bad) return { ok: false, error: bad };
  const db = createAdminClient();
  const { data: st } = await db.from("staff").select("id,display_name").eq("business_id", ctx.business.id).eq("id", input.staffId).eq("active", true).maybeSingle();
  if (!st) return { ok: false, error: "Team member not found." };
  const { data: overlap } = await db.from("sick_days").select("id").eq("business_id", ctx.business.id).eq("staff_id", st.id).not("time_off_id", "is", null).lte("starts_on", input.to).gte("ends_on", input.from).limit(1);
  if (overlap?.length) return { ok: false, error: `${st.display_name} is already marked out for some of those days.` };
  try {
    const r = await markOutSick(db, { businessId: ctx.business.id, staffId: st.id as string, staffName: st.display_name as string, from: input.from, to: input.to, reason: input.reason.trim().slice(0, 120) || null, by: ctx.staff.id, tz: ctx.business.timezone, notify: input.notify });
    const days = input.from === input.to ? formatDay(input.from, { weekday: "long", month: "short", day: "numeric" }) : `${formatDay(input.from, { month: "short", day: "numeric" })} – ${formatDay(input.to, { month: "short", day: "numeric" })}`;
    if (st.id === ctx.staff.id && ctx.staff.role !== "owner") await tellOwners(ctx.business.id, `${st.display_name} is out sick ${days}. ${r.offers} client${r.offers === 1 ? "" : "s"} ${input.notify ? "got a link to pick a new time" : "need a new time"}. See Out sick in Chairvana.`, `sick:${r.sickDayId}`);
    revalidatePath("/app/out-sick");
    revalidatePath("/app/calendar");
    revalidatePath("/app/today");
    const who = st.id === ctx.staff.id ? "You're" : `${st.display_name} is`;
    if (!r.offers) return { ok: true, text: `${who} marked out sick ${days}. No appointments were affected; no new ones can be booked.` };
    return { ok: true, text: `${who} marked out sick ${days}. ${input.notify ? `${r.sent} of ${r.offers} client${r.offers === 1 ? "" : "s"} were sent a link to pick a new time${r.notSent ? `; ${r.notSent} couldn't be reached (see below)` : ""}.` : `${r.offers} client${r.offers === 1 ? "" : "s"} need a new time: send their links below.`}` };
  } catch (e) {
    return { ok: false, error: `Couldn't mark out sick: ${(e as Error).message}` };
  }
}

async function offerFor(ctx: Ctx, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await createAdminClient().from("sick_offers").select("id,token,status,appointment_id,sick_days(staff_id,staff:staff!sick_days_staff_id_fkey(display_name))").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!data) return null;
  const sd = data.sick_days as unknown as { staff_id: string; staff: { display_name: string } | null } | null;
  if (!sd || !mayMark(ctx, sd.staff_id)) return null;
  return { ...data, stylist: sd.staff?.display_name ?? "Your stylist" };
}

/** Send a client their link again (a new copy of the same link). */
export async function resendOffer(id: string): Promise<Result> {
  const ctx = await getContext();
  const o = await offerFor(ctx, id);
  if (!o) return { ok: false, error: "Not found." };
  if (o.status !== "open") return { ok: false, error: "That link is already used or closed." };
  const r = await notifySickOffer(ctx.business.id, o.appointment_id as string, offerLink(o.token as string), o.stylist.split(" ")[0], Date.now());
  if (!r.sent) return { ok: false, error: `Not sent: ${r.why ?? "no way to reach them"}. Copy the link and send it yourself, or call them.` };
  await createAdminClient().from("sick_offers").update({ sent_at: new Date().toISOString() }).eq("id", o.id);
  revalidatePath("/app/out-sick");
  return { ok: true, text: "Sent again." };
}

/** You sorted it out another way (a call, moved it yourself): close their link. */
export async function markHandled(id: string): Promise<Result> {
  const ctx = await getContext();
  const o = await offerFor(ctx, id);
  if (!o) return { ok: false, error: "Not found." };
  await createAdminClient().from("sick_offers").update({ status: "handled", resolved_at: new Date().toISOString() }).eq("id", o.id).eq("status", "open");
  revalidatePath("/app/out-sick");
  return { ok: true, text: "Marked as handled; their link is closed." };
}

/** Back after all: the time off comes off the calendar and links that weren't used close. Rebooked appointments stay. */
export async function endSickDay(id: string): Promise<Result> {
  const ctx = await getContext();
  if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
  const db = createAdminClient();
  const { data: sd } = await db.from("sick_days").select("id,staff_id,time_off_id").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!sd || !mayMark(ctx, sd.staff_id as string)) return { ok: false, error: "Not found." };
  if (sd.time_off_id) await db.from("time_off").delete().eq("id", sd.time_off_id).eq("business_id", ctx.business.id);
  await db.from("sick_days").update({ time_off_id: null }).eq("id", id);
  await db.from("sick_offers").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("sick_day_id", id).eq("status", "open");
  revalidatePath("/app/out-sick");
  revalidatePath("/app/calendar");
  return { ok: true, text: "Back on the schedule. Unused links are closed; appointments clients already moved stay where they are." };
}
