import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { loadCalendar } from "@/lib/data/calendar";
import { supplyWarnings } from "@/lib/data/inventory";
import { closureForDate } from "@/lib/schedule/holidays";
import { buildAgenda } from "@/lib/today/agenda";
import { hoursFor } from "@/lib/staff/stylists";
import { isDateStr, todayIn } from "@/lib/time/zone";
import TodayView from "./TodayView";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string; denied?: string; staff?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const tz = ctx.business.timezone;
  const today = todayIn(tz);
  const date = isDateStr(sp.date) ? sp.date : today;
  // Default to your own day if you take appointments; "all" shows everyone.
  const staffParam = sp.staff === "all" ? null : sp.staff && /^[0-9a-f-]{36}$/.test(sp.staff) ? sp.staff : undefined;
  const first = await loadCalendar(ctx, { from: date, view: "day", staff: staffParam === undefined ? null : staffParam });
  const mineDefault = staffParam === undefined && first.stylists.length > 1 && first.stylists.some((s) => s.id === ctx.staff.id);
  const data = mineDefault ? await loadCalendar(ctx, { from: date, view: "day", staff: ctx.staff.id }) : first;
  const viewed = data.stylists.find((s) => s.id === data.viewStaff) ?? (data.stylists.length === 1 ? data.stylists[0] : null);
  const closure = closureForDate(date, tz, data.holidays, data.daysOff);
  const closed = !!closure && closure.kind !== "blocked_hours";
  const agenda = buildAgenda({ ...data, hours: hoursFor(viewed, data.hours) }, date, new Date(), closed, !!viewed);
  const supply: Record<string, string[]> = {};
  await Promise.all(
    agenda.items
      .filter((i) => i.when !== "done")
      .map(async (i) => {
        const w = await supplyWarnings(ctx.supabase, ctx.business.id, i.appt.clientId).catch(() => []);
        if (w.length) supply[i.appt.id] = w;
      }),
  );

  return (
    <>
      <AppNav current="/app/today" businessName={ctx.business.name} />
      {sp.denied && (
        <p role="alert" className="mx-auto mt-4 max-w-3xl rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          That page isn&apos;t available for your role. Ask the salon owner if you need it.
        </p>
      )}
      <TodayView
        agenda={agenda}
        today={today}
        timezone={tz}
        closureLabel={closed ? closure!.label : null}
        supply={supply}
        stylists={data.can.all ? data.stylists.map((s) => ({ id: s.id, name: s.name })) : []}
        viewStaff={data.viewStaff}
        staffNames={data.stylists.length > 1 && !data.viewStaff ? data.staffNames : null}
      />
    </>
  );
}
