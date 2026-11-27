import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { branding } from "../branding";
import { buildBoard, reviewSnippet, type BoardColumn } from "../display/board";
import { loadDaysOff } from "../data/schedule";
import { parseRange } from "../data/calendar";
import { loadProducts } from "../data/inventory";
import { lineTitle, reorderList, stockLevel } from "../inventory/stock";
import { mediaUrl } from "../media";
import { openTimes } from "../booking/overrides";
import { promoLabel } from "../promo/promo";
import { PROMO_COLS, toPromo } from "../promo/server";
import { closureForDate, mergeHolidays, type DayOff } from "../schedule/holidays";
import { hoursFor, STAFF_COLS, toStylists, type StaffRow, type Stylist } from "../staff/stylists";
import { addDays, formatDay, todayIn, wallParts, weekday, zonedToUtc, type DateStr } from "../time/zone";
import type { Hours } from "../booking/availability";
import { dayLoad, nextAppointmentLine, openStatus, weekHours, windows, workingMinutes, type DayHours, type DayLoad, type OpenStatus } from "./schedule";
import type { Audience, Slide, SlideType } from "./slides";

export interface ScreenAppt {
  id: string;
  staffId: string;
  start: string;
  end: string;
  status: string;
  name: string;
  services: string[];
  notes: string | null;
  quiet: boolean;
}

export interface DaySummary {
  date: DateStr;
  label: string;
  load: DayLoad;
  booked: number;
  freeMinutes: number;
  closedReason: string | null;
}

/** Everything a screen's slides need, loaded once per refresh. Staff-only parts are only filled on staff screens. */
export interface ScreenData {
  salon: { name: string; logoUrl: string | null; accent: string | null; bookUrl: string; shortUrl: string; tz: string; today: DateStr };
  stylists: { id: string; name: string; title: string | null }[];
  hours?: { status: OpenStatus; week: DayHours[] };
  specials?: { code: string; text: string; until: string | null }[];
  reviews?: { text: string; name: string }[];
  photos?: { url: string; caption: string | null; staffId: string | null }[];
  products?: { name: string; brand: string; priceCents: number }[];
  media?: Record<string, { url: string; title: string | null; kind: "image" | "video" }>;
  openings?: { stylist: string; start: string; minutes: number }[];
  board?: { columns: BoardColumn[]; next: string | null };
  today?: { appts: ScreenAppt[]; next: string | null };
  week?: DaySummary[];
  month?: { first: DateStr; days: DaySummary[] };
  /** Staff screens with the week or month: each day's appointments, for tapping a day open. */
  days?: Record<DateStr, ScreenAppt[]>;
  inventory?: { name: string; level: "out" | "low"; onHand: number; vendor: string | null }[];
}

const STAFF_ONLY: SlideType[] = ["today", "week", "month", "inventory", "colorwheel", "clientcard"];

/**
 * onlyStaffId: a team member who can't see everyone's book gets only their own
 * appointments on staff screens.
 */
export async function loadScreenData(db: SupabaseClient, businessId: string, slides: Slide[], audience: Audience, opts: { now?: Date; onlyStaffId?: string | null } = {}): Promise<ScreenData> {
  const now = opts.now ?? new Date();
  const need = new Set(slides.map((s) => s.type).filter((t) => audience === "staff" || !STAFF_ONLY.includes(t)));
  const { data: b, error } = await db.from("businesses").select("id,name,slug,timezone,business_hours,holidays,branding,booking_settings").eq("id", businessId).single();
  if (error || !b) throw new Error("Salon not found.");
  const tz = b.timezone as string;
  const today = todayIn(tz, now);
  const look = branding(b.branding);
  const site = process.env.SITE_URL ?? "https://chairvana.app";
  const salonHours = (b.business_hours ?? {}) as Hours;
  const rules = mergeHolidays(b.holidays);

  const { data: staffRows } = await db.from("staff").select(STAFF_COLS).eq("business_id", businessId);
  const stylists = toStylists((staffRows ?? []) as StaffRow[]);

  const out: ScreenData = {
    salon: { name: b.name, logoUrl: mediaUrl(look.logoPath), accent: look.accent ?? null, bookUrl: `${site}/s/${b.slug}/book`, shortUrl: `${site.replace(/^https?:\/\//, "")}/${b.slug}`, tz, today },
    stylists: stylists.map((s) => ({ id: s.id, name: s.name, title: s.title })),
  };

  // Closures over the next ~6 weeks (hours sign, week and month views).
  const horizon = need.has("month") ? 42 : 21;
  const rangeFrom = zonedToUtc(need.has("month") ? `${today.slice(0, 8)}01` : today, 0, tz);
  const rangeTo = zonedToUtc(addDays(today, horizon), 0, tz);
  const daysOff: DayOff[] = need.has("hours") || need.has("week") || need.has("month") || need.has("openings") ? await loadDaysOff(db, businessId, rangeFrom, rangeTo) : [];
  const closedOn = (d: DateStr) => {
    const c = closureForDate(d, tz, rules, daysOff);
    return c && c.kind !== "blocked_hours" ? c.label || "Closed" : null;
  };

  if (need.has("hours")) out.hours = { status: openStatus(now, tz, salonHours, closedOn), week: weekHours(today, salonHours, closedOn) };

  const tasks: Promise<void>[] = [];

  if (need.has("specials")) {
    tasks.push((async () => {
      const { data } = await db.from("promo_codes").select(PROMO_COLS).eq("business_id", businessId).eq("active", true);
      out.specials = (data ?? [])
        .map((r) => toPromo(r as Parameters<typeof toPromo>[0]))
        .filter((p) => (!p.startsOn || p.startsOn <= today) && (!p.endsOn || p.endsOn >= today))
        .map((p) => ({ code: p.code, text: p.description ?? promoLabel(p), until: p.endsOn ? formatDay(p.endsOn, { month: "long", day: "numeric" }) : null }));
    })());
  }
  if (need.has("reviews")) {
    tasks.push((async () => {
      const { data } = await db.from("reviews").select("body,display_name").eq("business_id", businessId).eq("status", "published").gte("rating", 5).not("body", "is", null).order("submitted_at", { ascending: false }).limit(10);
      out.reviews = (data ?? []).map((r) => ({ text: reviewSnippet(r.body as string), name: (r.display_name as string | null) ?? "A client" }));
    })());
  }
  if (need.has("portfolio")) {
    tasks.push((async () => {
      const { data } = await db.from("salon_photos").select("path,caption,staff_id").eq("business_id", businessId).order("sort").order("created_at", { ascending: false }).limit(60);
      out.photos = (data ?? []).map((p) => ({ url: mediaUrl(p.path as string)!, caption: p.caption as string | null, staffId: p.staff_id as string | null }));
    })());
  }
  if (need.has("products") || need.has("inventory")) {
    tasks.push((async () => {
      const products = await loadProducts(db, businessId);
      if (need.has("products")) {
        out.products = products
          .filter((p) => p.kind === "retail" && p.onHand > 0 && (p.priceCents ?? 0) > 0)
          .slice(0, 40)
          .map((p) => ({ name: p.name, brand: lineTitle(p), priceCents: p.priceCents! }));
      }
      if (need.has("inventory") && audience === "staff") {
        const vendorOf = new Map(reorderList(products).flatMap((g) => g.lines.map((l) => [l.product.id, g.vendor] as const)));
        out.inventory = products
          .map((p) => ({ p, level: stockLevel(p) }))
          .filter((x) => x.level === "out" || x.level === "low")
          .sort((a, b) => (a.level === b.level ? a.p.name.localeCompare(b.p.name) : a.level === "out" ? -1 : 1))
          .slice(0, 40)
          .map(({ p, level }) => ({ name: `${lineTitle(p)} ${p.name}`, level: level as "out" | "low", onHand: p.onHand, vendor: vendorOf.get(p.id) ?? p.vendor ?? null }));
      }
    })());
  }
  const mediaIds = [...new Set(slides.flatMap((s) => [s.mediaId, s.bgMediaId]).filter((x): x is string => !!x))];
  if (mediaIds.length) {
    tasks.push((async () => {
      const { data } = await db.from("signage_media").select("id,path,title,kind").eq("business_id", businessId).in("id", mediaIds);
      out.media = Object.fromEntries((data ?? []).map((m) => [m.id as string, { url: mediaUrl(m.path as string)!, title: m.title as string | null, kind: (m.kind === "video" ? "video" : "image") as "image" | "video" }]));
    })());
  }

  // Appointments: today (board, today, openings), the week, or the month.
  const wantsDay = need.has("board") || need.has("today") || need.has("openings");
  const wantsRange = need.has("week") || need.has("month");
  if (wantsDay || wantsRange) {
    tasks.push((async () => {
      const first: DateStr = need.has("month") ? `${today.slice(0, 8)}01` : today;
      const last: DateStr = need.has("month") ? addDays(first, 42) : need.has("week") ? addDays(today, 7) : addDays(today, 1);
      const { data } = await db
        .from("appointments")
        .select("id,staff_id,start_at,end_at,status,notes,quiet,clients(first_name,last_name,quiet),appointment_services(sort,services(name))")
        .eq("business_id", businessId)
        .gte("start_at", zonedToUtc(first, 0, tz).toISOString())
        .lt("start_at", zonedToUtc(last, 0, tz).toISOString())
        .not("status", "in", "(cancelled,no_show)")
        .in("staff_id", opts.onlyStaffId ? [opts.onlyStaffId] : stylists.map((x) => x.id).concat(((staffRows ?? []) as StaffRow[]).map((r) => r.id)))
        .order("start_at")
        .limit(3000);
      type Row = { id: string; staff_id: string; start_at: string; end_at: string; status: string; notes: string | null; quiet: boolean; clients: { first_name: string; last_name: string | null; quiet: boolean } | null; appointment_services: { sort: number; services: { name: string } | null }[] };
      const appts: ScreenAppt[] = ((data ?? []) as unknown as Row[]).map((a) => ({
        id: a.id,
        staffId: a.staff_id,
        start: new Date(a.start_at).toISOString(),
        end: new Date(a.end_at).toISOString(),
        status: a.status,
        name: [a.clients?.first_name, a.clients?.last_name].filter(Boolean).join(" ") || "Client",
        services: [...a.appointment_services].sort((x, y) => x.sort - y.sort).map((l) => l.services?.name ?? "Service"),
        notes: a.notes,
        quiet: !!(a.quiet || a.clients?.quiet),
      }));
      const dayOf = (iso: string) => wallParts(new Date(iso), tz).date;
      const todays = appts.filter((a) => dayOf(a.start) === today);
      const anyToday = todays.length > 0;
      const left = todays.filter((a) => Date.parse(a.end) > now.getTime() && a.status !== "completed");

      // The next appointment after today, when today has nothing left.
      let next: string | null = null;
      let nextPublic: string | null = null;
      if (!left.length && (need.has("board") || need.has("today"))) {
        const { data: n } = await db
          .from("appointments")
          .select("start_at,staff_id,clients(first_name,last_name),appointment_services(sort,services(name))")
          .eq("business_id", businessId)
          .gte("start_at", zonedToUtc(addDays(today, 1), 0, tz).toISOString())
          .in("staff_id", opts.onlyStaffId ? [opts.onlyStaffId] : ((staffRows ?? []) as StaffRow[]).map((r) => r.id))
          .not("status", "in", "(cancelled,no_show,completed)")
          .order("start_at")
          .limit(1);
        const r = (n ?? [])[0] as unknown as { start_at: string; staff_id: string; clients: { first_name: string; last_name: string | null } | null; appointment_services: { sort: number; services: { name: string } | null }[] } | undefined;
        const up = r
          ? {
              start: new Date(r.start_at).toISOString(),
              clientName: [r.clients?.first_name, r.clients?.last_name].filter(Boolean).join(" ") || "Client",
              services: [...r.appointment_services].sort((x, y) => x.sort - y.sort).map((l) => l.services?.name ?? "Service"),
              stylist: stylists.length > 1 ? stylists.find((s) => s.id === r.staff_id)?.name.split(" ")[0] : undefined,
            }
          : null;
        next = nextAppointmentLine(up, today, tz, { anyToday, fullName: true });
        nextPublic = nextAppointmentLine(up, today, tz, { anyToday });
      }

      if (need.has("board")) {
        const cols = buildBoard(todays.map((a) => ({ id: a.id, staffId: a.staffId, clientName: a.name, start: a.start, end: a.end, status: a.status, services: a.services })), stylists.map((s) => ({ id: s.id, name: s.name })), now);
        out.board = { columns: cols, next: nextPublic };
      }
      if (need.has("today") && audience === "staff") out.today = { appts: todays, next };

      const busyFor = async (from: Date, to: Date) => {
        const { data: blocks } = await db.from("staff_busy_blocks").select("staff_id,during").eq("business_id", businessId).overlaps("during", `[${from.toISOString()},${to.toISOString()})`);
        return (blocks ?? []).map((x) => {
          const r = parseRange(x.during as string);
          return { staffId: x.staff_id as string, start: new Date(r.start), end: new Date(r.end) };
        });
      };

      if (need.has("openings") && !closedOn(today)) {
        const busy = await busyFor(zonedToUtc(today, 0, tz), zonedToUtc(addDays(today, 1), 0, tz));
        out.openings = stylists.flatMap((s) => windows(openTimes({ date: today, tz, hours: hoursFor(s, salonHours), services: [], busy: busy.filter((x) => x.staffId === s.id), now, stepMinutes: 15 }))
          .slice(0, 3)
          .map((w) => ({ stylist: s.name.split(" ")[0], start: zonedToUtc(today, w.start, tz).toISOString(), minutes: w.minutes })));
      } else if (need.has("openings")) out.openings = [];

      if (wantsRange && audience === "staff") {
        const summarize = (date: DateStr, label: string): DaySummary => {
          const why = closedOn(date);
          const mine = appts.filter((a) => dayOf(a.start) === date);
          const open = sumWorking(date, stylists, salonHours);
          const bookedMin = mine.reduce((n, a) => n + (Date.parse(a.end) - Date.parse(a.start)) / 60000, 0);
          return { date, label, load: dayLoad(open, bookedMin, !!why), booked: mine.length, freeMinutes: why ? 0 : Math.max(0, Math.round(open - bookedMin)), closedReason: why };
        };
        const byDay: Record<DateStr, ScreenAppt[]> = {};
        for (const a of appts) (byDay[dayOf(a.start)] ??= []).push(a);
        out.days = byDay;
        if (need.has("week")) out.week = Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d, i) => summarize(d, i === 0 ? "Today" : formatDay(d, { weekday: "short", month: "short", day: "numeric" })));
        if (need.has("month")) {
          const first: DateStr = `${today.slice(0, 8)}01`;
          const gridStart = addDays(first, -weekday(first));
          out.month = { first, days: Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).map((d) => summarize(d, d)) };
        }
      }
    })());
  }

  await Promise.all(tasks);
  return out;
}

/** Working minutes across everyone who takes appointments that day. */
function sumWorking(date: DateStr, stylists: Stylist[], salon: Hours): number {
  if (!stylists.length) return workingMinutes(date, salon);
  return stylists.reduce((n, s) => n + workingMinutes(date, hoursFor(s, salon)), 0);
}
