import { requirePermission } from "@/lib/context";
import { accentStyle, branding } from "@/lib/branding";
import { loadCalendar } from "@/lib/data/calendar";
import { buildBoard, reviewSnippet } from "@/lib/display/board";
import { mediaUrl } from "@/lib/media";
import { promoLabel } from "@/lib/promo/promo";
import { PROMO_COLS, toPromo } from "@/lib/promo/server";
import { closureForDate } from "@/lib/schedule/holidays";
import { hoursFor } from "@/lib/staff/stylists";
import { buildAgenda } from "@/lib/today/agenda";
import { addDays, isDateStr, todayIn } from "@/lib/time/zone";
import DisplayView from "./DisplayView";

export const metadata = { title: "Display" };
export const dynamic = "force-dynamic";

/** Full-screen salon display for a TV or smart board. ?touch=1 for touch boards, ?date= to show another day. */
export default async function DisplayPage({ searchParams }: { searchParams: Promise<{ date?: string; touch?: string }> }) {
  const ctx = await requirePermission("calendar.all");
  const sp = await searchParams;
  const tz = ctx.business.timezone;
  const today = todayIn(tz);
  const date = isDateStr(sp.date) ? sp.date : today;
  const data = await loadCalendar(ctx, { from: date, view: "day", staff: null });
  const now = new Date();
  const board = buildBoard(
    data.appointments.map((a) => ({ id: a.id, staffId: a.staffId, clientName: a.clientName, start: a.start, end: a.end, status: a.status, services: a.services.map((s) => s.name) })),
    data.stylists.map((s) => ({ id: s.id, name: s.name })),
    now,
  );
  // Open times today, per stylist (30 minutes or more).
  const closure = closureForDate(date, tz, data.holidays, data.daysOff);
  const closed = !!closure && closure.kind !== "blocked_hours";
  const openings = closed
    ? []
    : data.stylists.flatMap((s) => {
        const ag = buildAgenda({ ...data, appointments: data.appointments.filter((a) => a.staffId === s.id), hours: hoursFor(s, data.hours) }, date, now, false, true);
        return ag.gaps.filter((g) => g.end.getTime() > now.getTime()).slice(0, 3).map((g) => ({ stylist: s.name.split(" ")[0], start: g.start.toISOString(), minutes: g.minutes }));
      });

  const [{ data: biz }, { data: promos }, { data: reviews }] = await Promise.all([
    ctx.supabase.from("businesses").select("slug,branding").eq("id", ctx.business.id).single(),
    ctx.supabase.from("promo_codes").select(PROMO_COLS).eq("business_id", ctx.business.id).eq("active", true),
    ctx.supabase.from("reviews").select("rating,body,display_name").eq("business_id", ctx.business.id).eq("status", "published").gte("rating", 5).not("body", "is", null).order("submitted_at", { ascending: false }).limit(6),
  ]);
  const look = branding(biz?.branding);
  const site = process.env.SITE_URL ?? "https://chairvana.app";
  const specials = (promos ?? [])
    .map((r) => toPromo(r as Parameters<typeof toPromo>[0]))
    .filter((p) => (!p.startsOn || p.startsOn <= today) && (!p.endsOn || p.endsOn >= today))
    .map((p) => ({ code: p.code, text: p.description ?? promoLabel(p), until: p.endsOn }));

  return (
    <div style={accentStyle(look)}>
      <DisplayView
        salon={ctx.business.name}
        logoUrl={mediaUrl(look.logoPath)}
        tz={tz}
        date={date}
        today={today}
        prev={addDays(date, -1)}
        next={addDays(date, 1)}
        closedLabel={closed ? closure?.label ?? "Closed" : null}
        board={board}
        openings={openings}
        specials={specials}
        reviews={(reviews ?? []).map((r) => ({ text: reviewSnippet(r.body as string), name: r.display_name ?? "A client" }))}
        bookUrl={`${site}/s/${biz?.slug}/book`}
        touch={sp.touch === "1"}
      />
    </div>
  );
}
