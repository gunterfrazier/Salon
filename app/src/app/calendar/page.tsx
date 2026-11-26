import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { loadCalendar } from "@/lib/data/calendar";
import { isDateStr, startOfWeek, todayIn } from "@/lib/time/zone";
import CalendarView from "./CalendarView";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; staff?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const view = sp.view === "week" ? "week" : sp.view === "month" ? "month" : "day";
  const day = isDateStr(sp.date) ? sp.date : todayIn(ctx.business.timezone);
  const from = view === "week" ? startOfWeek(day) : view === "month" ? startOfWeek(`${day.slice(0, 8)}01`) : day;
  const data = await loadCalendar(ctx, { from, view, staff: sp.staff && /^[0-9a-f-]{36}$/.test(sp.staff) ? sp.staff : null });

  return (
    <>
      <AppNav current="/calendar" businessName={ctx.business.name} />
      <CalendarView data={data} focusDate={day} />
    </>
  );
}
