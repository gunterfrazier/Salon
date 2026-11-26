import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { loadDaysOff } from "@/lib/data/schedule";
import { mergeHolidays } from "@/lib/schedule/holidays";
import { todayIn } from "@/lib/time/zone";
import ScheduleSettings from "./ScheduleSettings";
import { STAFF_COLS, toStylists, type StaffRow } from "@/lib/staff/stylists";

export const metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const ctx = await requirePermission("settings.schedule");
  const now = new Date();
  const until = new Date(now.getTime() + 2 * 366 * 86_400_000);
  const [daysOff, { data: personal }, { data: staff }] = await Promise.all([
    loadDaysOff(ctx.supabase, ctx.business.id, now, until),
    ctx.supabase.from("time_off").select("id,start_at,end_at,reason,all_day,staff_id").eq("business_id", ctx.business.id).eq("salon_wide", false).gt("end_at", now.toISOString()).lt("start_at", until.toISOString()).order("start_at"),
    ctx.supabase.from("staff").select(STAFF_COLS).eq("business_id", ctx.business.id),
  ]);
  const people = toStylists((staff ?? []) as StaffRow[]);
  return (
    <>
      <AppNav current="/app/settings/schedule" businessName={ctx.business.name} />
      <ScheduleSettings
        businessName={ctx.business.name}
        timezone={ctx.business.timezone}
        today={todayIn(ctx.business.timezone)}
        holidays={mergeHolidays(ctx.business.holidays)}
        daysOff={daysOff}
        personal={(personal ?? []).map((t) => ({ id: t.id, start: new Date(t.start_at).toISOString(), end: new Date(t.end_at).toISOString(), reason: t.reason, allDay: t.all_day, who: people.find((p) => p.id === t.staff_id)?.name ?? "Team member" }))}
        people={people.length > 1 ? people.map((p) => ({ id: p.id, name: p.name })) : []}
      />
    </>
  );
}
