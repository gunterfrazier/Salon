"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { holidayDate, mergeHolidays, PRESET_HOLIDAYS, type HolidayDate, type HolidayRule } from "@/lib/schedule/holidays";
import { addDays, isDateStr, parseHHMM, zonedToUtc } from "@/lib/time/zone";

type Result = { ok: true } | { ok: false; error: string };

function done() {
  revalidatePath("/settings/schedule");
  revalidatePath("/calendar");
  revalidatePath("/book");
}

async function saveRules(rules: HolidayRule[]): Promise<Result> {
  const ctx = await getContext();
  // Store only switches for presets, and full custom rules.
  const stored = rules.map((r) => (r.custom ? r : { key: r.key, name: r.name, date: r.date, closed: r.closed }));
  const { error } = await ctx.supabase.from("businesses").update({ holidays: { rules: stored } }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

export async function setHolidayClosed(key: string, closed: boolean): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.schedule");
  if (no) return no;
  const rules = mergeHolidays(ctx.business.holidays);
  if (!rules.some((r) => r.key === key)) return { ok: false, error: "Unknown holiday." };
  return saveRules(rules.map((r) => (r.key === key ? { ...r, closed } : r)));
}

export async function addCustomHoliday(name: string, date: HolidayDate): Promise<Result> {
  const label = name.trim().slice(0, 60);
  if (!label) return { ok: false, error: "Give the holiday a name." };
  const valid =
    (date.type === "fixed" && date.month >= 1 && date.month <= 12 && date.day >= 1 && date.day <= 31) ||
    (date.type === "nth" && date.month >= 1 && date.month <= 12 && date.weekday >= 0 && date.weekday <= 6 && [1, 2, 3, 4, -1].includes(date.n));
  if (!valid) return { ok: false, error: "Pick a valid date." };
  const rule: HolidayRule = { key: `custom_${crypto.randomUUID().slice(0, 8)}`, name: label, date: date.type === "fixed" ? { type: "fixed", month: date.month, day: date.day } : { type: "nth", month: date.month, weekday: date.weekday, n: date.n }, closed: true, custom: true };
  const y = new Date().getUTCFullYear();
  if (!holidayDate(rule, y) && !holidayDate(rule, y + 1)) return { ok: false, error: "That date doesn't exist." };
  const ctx = await getContext();
  const no = denied(ctx, "settings.schedule");
  if (no) return no;
  return saveRules([...mergeHolidays(ctx.business.holidays), rule]);
}

export async function deleteCustomHoliday(key: string): Promise<Result> {
  if (PRESET_HOLIDAYS.some((p) => p.key === key)) return { ok: false, error: "Built-in holidays can be switched off but not deleted." };
  const ctx = await getContext();
  const no = denied(ctx, "settings.schedule");
  if (no) return no;
  return saveRules(mergeHolidays(ctx.business.holidays).filter((r) => r.key !== key));
}

export interface TimeOffInput {
  kind: "days" | "hours";
  startDate: string;
  endDate?: string; // days: last day off (inclusive)
  startTime?: string; // hours
  endTime?: string;
  reason?: string;
  /** A team member's id for personal time off; empty/"salon" for the whole salon. */
  who?: string;
}

export async function addTimeOff(i: TimeOffInput): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.schedule");
  if (no) return no;
  const tz = ctx.business.timezone;
  if (!isDateStr(i.startDate)) return { ok: false, error: "Pick a date." };
  let start: Date;
  let end: Date;
  if (i.kind === "days") {
    const last = i.endDate && isDateStr(i.endDate) ? i.endDate : i.startDate;
    if (last < i.startDate) return { ok: false, error: "The last day can't be before the first." };
    if (last > addDays(i.startDate, 365)) return { ok: false, error: "Keep it under a year." };
    start = zonedToUtc(i.startDate, 0, tz);
    end = zonedToUtc(addDays(last, 1), 0, tz);
  } else {
    try {
      start = zonedToUtc(i.startDate, parseHHMM(i.startTime ?? ""), tz);
      end = zonedToUtc(i.startDate, parseHHMM(i.endTime ?? ""), tz);
    } catch {
      return { ok: false, error: "Pick a start and end time." };
    }
    if (end <= start) return { ok: false, error: "End time must be after the start time." };
  }
  let staffId = ctx.staff.id;
  const salonWide = !i.who || i.who === "salon";
  if (!salonWide) {
    const { data: m } = await ctx.supabase.from("staff").select("id").eq("business_id", ctx.business.id).eq("id", i.who!).eq("active", true).maybeSingle();
    if (!m) return { ok: false, error: "Pick who's off." };
    staffId = m.id;
  }
  const { error } = await ctx.supabase.from("time_off").insert({
    business_id: ctx.business.id,
    staff_id: staffId,
    salon_wide: salonWide,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: i.kind === "days",
    reason: (i.reason ?? "").trim().slice(0, 80) || null,
  });
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

export async function deleteTimeOff(id: string): Promise<Result> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.schedule");
  if (no) return no;
  const { data, error } = await ctx.supabase.from("time_off").delete().eq("id", id).eq("business_id", ctx.business.id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Not found." };
  done();
  return { ok: true };
}
