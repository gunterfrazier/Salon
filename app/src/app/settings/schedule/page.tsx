import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { loadDaysOff } from "@/lib/data/schedule";
import { mergeHolidays } from "@/lib/schedule/holidays";
import { todayIn } from "@/lib/time/zone";
import ScheduleSettings from "./ScheduleSettings";

export const metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const ctx = await requirePermission("settings.schedule");
  const now = new Date();
  const daysOff = await loadDaysOff(ctx.supabase, ctx.business.id, now, new Date(now.getTime() + 2 * 366 * 86_400_000));
  return (
    <>
      <AppNav current="/settings/schedule" businessName={ctx.business.name} />
      <ScheduleSettings
        businessName={ctx.business.name}
        timezone={ctx.business.timezone}
        today={todayIn(ctx.business.timezone)}
        holidays={mergeHolidays(ctx.business.holidays)}
        daysOff={daysOff}
      />
    </>
  );
}
