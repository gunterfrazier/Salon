import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { loadCalendar } from "@/lib/data/calendar";
import { closureForDate } from "@/lib/schedule/holidays";
import { buildAgenda } from "@/lib/today/agenda";
import { isDateStr, todayIn } from "@/lib/time/zone";
import TodayView from "./TodayView";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const tz = ctx.business.timezone;
  const today = todayIn(tz);
  const date = isDateStr(sp.date) ? sp.date : today;
  const data = await loadCalendar(ctx, { from: date, view: "day" });
  const closure = closureForDate(date, tz, data.holidays, data.daysOff);
  const closed = !!closure && closure.kind !== "blocked_hours";
  const agenda = buildAgenda(data, date, new Date(), closed);

  return (
    <>
      <AppNav current="/today" businessName={ctx.business.name} />
      <TodayView agenda={agenda} today={today} timezone={tz} closureLabel={closed ? closure!.label : null} />
    </>
  );
}
