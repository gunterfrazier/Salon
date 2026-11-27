import { AppNav } from "@/components/AppNav";
import { branding } from "@/lib/branding";
import { requirePermission } from "@/lib/context";
import { loadCalendar } from "@/lib/data/calendar";
import { reviewSnippet } from "@/lib/display/board";
import { mediaUrl } from "@/lib/media";
import { promoLabel } from "@/lib/promo/promo";
import { PROMO_COLS, toPromo } from "@/lib/promo/server";
import { hoursFor } from "@/lib/staff/stylists";
import { buildWrapped } from "@/lib/studio/wrapped";
import { buildAgenda } from "@/lib/today/agenda";
import { addDays, formatDay, formatTime, todayIn, wallParts, zonedToUtc } from "@/lib/time/zone";
import StudioView from "./StudioView";

export const metadata = { title: "Graphics studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const ctx = await requirePermission("settings.salon");
  const db = ctx.supabase;
  const biz = ctx.business.id;
  const tz = ctx.business.timezone;
  const today = todayIn(tz);
  const year = Number(today.slice(0, 4));

  const [{ data: b }, { data: photos }, { data: promos }, { data: reviews }] = await Promise.all([
    db.from("businesses").select("slug,branding").eq("id", biz).single(),
    db.from("salon_photos").select("path,caption").eq("business_id", biz).order("sort").order("created_at", { ascending: false }).limit(40),
    db.from("promo_codes").select(PROMO_COLS).eq("business_id", biz).eq("active", true),
    db.from("reviews").select("body,display_name").eq("business_id", biz).eq("status", "published").gte("rating", 5).not("body", "is", null).order("submitted_at", { ascending: false }).limit(10),
  ]);
  const look = branding(b?.branding);

  // Open times over the next 7 days (an hour or more), per stylist.
  const week = await loadCalendar(ctx, { from: today, view: "week", staff: null });
  const now = new Date();
  const openings: string[] = [];
  for (let i = 0; i < 7 && openings.length < 8; i++) {
    const date = addDays(today, i);
    for (const s of week.stylists) {
      const appts = week.appointments.filter((a) => a.staffId === s.id && wallParts(new Date(a.start), tz).date === date);
      const ag = buildAgenda({ ...week, appointments: appts, hours: hoursFor(s, week.hours) }, date, now, false, true);
      for (const g of ag.gaps.filter((x) => x.minutes >= 60 && x.end > now).slice(0, 2)) {
        openings.push(`${formatDay(date, { weekday: "short", month: "short", day: "numeric" })} · ${formatTime(g.start, tz).replace(/\s\w+$/, "")}${week.stylists.length > 1 ? ` with ${s.name.split(" ")[0]}` : ""}`);
      }
    }
  }

  // Chair Wrapped for this year.
  const from = zonedToUtc(`${year}-01-01`, 0, tz).toISOString();
  const to = zonedToUtc(`${year + 1}-01-01`, 0, tz).toISOString();
  const { data: visits } = await db.from("appointments").select("client_id,start_at,end_at,appointment_services(services(name))").eq("business_id", biz).eq("status", "completed").gte("start_at", from).lt("start_at", to).limit(10000);
  const { data: before } = await db.from("appointments").select("client_id").eq("business_id", biz).eq("status", "completed").lt("start_at", from).limit(20000);
  const { data: prior } = await db.from("clients").select("id").eq("business_id", biz).gt("prior_visit_count", 0).limit(20000);
  const { count: fiveStar } = await db.from("reviews").select("id", { count: "exact", head: true }).eq("business_id", biz).eq("rating", 5).gte("submitted_at", from).lt("submitted_at", to);
  const wrapped = buildWrapped(
    year,
    ((visits ?? []) as unknown as { client_id: string; start_at: string; end_at: string; appointment_services: { services: { name: string } | null }[] }[]).map((v) => ({
      clientId: v.client_id,
      start: wallParts(new Date(v.start_at), tz).date,
      minutes: (Date.parse(v.end_at) - Date.parse(v.start_at)) / 60000,
      services: v.appointment_services.map((x) => x.services?.name ?? "").filter(Boolean),
    })),
    new Set([...(before ?? []).map((x) => x.client_id as string), ...(prior ?? []).map((x) => x.id as string)]),
    fiveStar ?? 0,
  );

  const site = process.env.SITE_URL ?? "https://chairvana.app";
  return (
    <>
      <AppNav current="/app/marketing" businessName={ctx.business.name} />
      <StudioView
        salon={ctx.business.name}
        bookUrl={`${site}/s/${b?.slug}/book`}
        shortUrl={`${site}/${b?.slug}`}
        accent={look.accent ?? "#b9dcf2"}
        logoUrl={mediaUrl(look.logoPath)}
        photos={[...(look.coverPath ? [{ url: mediaUrl(look.coverPath)!, caption: "Cover photo" }] : []), ...(photos ?? []).map((p) => ({ url: mediaUrl(p.path)!, caption: p.caption }))]}
        specials={(promos ?? []).map((r) => toPromo(r as Parameters<typeof toPromo>[0])).filter((p) => !p.endsOn || p.endsOn >= today).map((p) => ({ code: p.code, text: p.description ?? promoLabel(p), until: p.endsOn ? formatDay(p.endsOn, { month: "long", day: "numeric" }) : null }))}
        reviews={(reviews ?? []).map((r) => ({ text: reviewSnippet(r.body as string, 180), name: r.display_name ?? "A client" }))}
        openings={openings}
        wrapped={wrapped}
      />
    </>
  );
}
