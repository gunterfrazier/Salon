import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { loadCalendar } from "@/lib/data/calendar";
import { isDateStr, startOfWeek, todayIn } from "@/lib/time/zone";
import CalendarView from "./CalendarView";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const view = sp.view === "week" ? "week" : "day";
  const day = isDateStr(sp.date) ? sp.date : todayIn(ctx.business.timezone);
  const data = await loadCalendar(ctx, { from: view === "week" ? startOfWeek(day) : day, view });

  return (
    <>
      <AppNav current="/calendar" businessName={ctx.business.name} />
      <CalendarView data={data} focusDate={day} />
    </>
  );
}
