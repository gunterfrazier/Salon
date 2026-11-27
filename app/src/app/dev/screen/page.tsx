import { notFound } from "next/navigation";
import ScreenPlayer from "@/components/screens/ScreenPlayer";
import type { ScreenData } from "@/lib/screens/data";
import { nextAppointmentLine, openStatus, weekHours } from "@/lib/screens/schedule";
import { fromTemplate, TEMPLATES, type Slide } from "@/lib/screens/slides";
import { addDays, parseHHMM, weekday, zonedToUtc } from "@/lib/time/zone";
import type { Hours } from "@/lib/booking/availability";
import menuJson from "../../../../seed/service-menu.json";

/** Development-only preview of the screen player with sample data (404 in production). ?t=window|lobby|station|desk|colorbar&s=slide index */
export const dynamic = "force-dynamic";

export default async function DevScreen({ searchParams }: { searchParams: Promise<{ t?: string; s?: string; theme?: string; r?: string; bg?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const tpl = TEMPLATES.find((x) => x.key === sp.t) ?? TEMPLATES[0];
  const TZ = "America/Chicago";
  const today = "2026-12-01";
  const now = zonedToUtc(today, parseHHMM("16:10"), TZ);
  const hours = menuJson.hours as unknown as Hours;
  const closedOn = (d: string) => (d === "2026-12-24" || d === "2026-12-25" ? "Christmas" : null);
  const at = (t: string, d = today) => zonedToUtc(d, parseHHMM(t), TZ).toISOString();
  const appt = (id: string, t: string, e: string, name: string, services: string[], status = "booked", notes: string | null = null) => ({ id, staffId: "k", start: at(t), end: at(e), status, name, services, notes, quiet: id === "3" });
  const days = (n: number, from: string) => Array.from({ length: n }, (_, i) => addDays(from, i));
  const load = (d: string) => (closedOn(d) || [0, 1, 3].includes(weekday(d)) ? "closed" : weekday(d) === 5 ? "full" : weekday(d) === 2 ? "busy" : "open") as "closed" | "open" | "busy" | "full";
  const data: ScreenData = {
    salon: { name: "Intensity Salon", logoUrl: null, accent: null, bookUrl: "https://chairvana.app/s/intensity-salon/book", shortUrl: "chairvana.app/intensity-salon", tz: TZ, today },
    stylists: [{ id: "k", name: "Karissa Frazier", title: "Color specialist" }],
    hours: { status: openStatus(now, TZ, hours, closedOn), week: weekHours(today, hours, closedOn) },
    specials: [{ code: "HOLIDAY15", text: "15% off any color service", until: "December 31" }, { code: "NEWCLIENT", text: "$10 off your first visit", until: null }],
    reviews: [{ text: "Karissa is amazing! My color has never looked better.", name: "Morgan T." }],
    photos: [{ url: "/brand/og.png", caption: "Balayage", staffId: "k" }],
    products: [{ name: "Shades EQ Gloss Shampoo", brand: "Redken", priceCents: 2400 }, { name: "Extreme Length Primer", brand: "Redken", priceCents: 2900 }, { name: "Dream Coat", brand: "Color WOW", priceCents: 2800 }],
    media: sp.bg ? { bg: { url: "/brand/og.png", title: "Background", kind: "image" } } : {},
    openings: [{ stylist: "Karissa", start: at("17:30"), minutes: 90 }],
    board: { columns: [{ staffId: "k", stylist: "Karissa", rows: [{ id: "1", start: at("15:30"), end: at("17:00"), name: "Jamie R.", services: "All Over Color + Cut", state: "now" }, { id: "2", start: at("17:00"), end: at("17:45"), name: "Morgan T.", services: "Women's Cut", state: "next" }] }], next: null },
    today: { appts: [appt("1", "15:30", "17:00", "Jamie Rivers", ["All Over Color", "Women's Cut"], "in_service", "Wants it a little lighter"), appt("2", "17:00", "17:45", "Morgan Tate", ["Women's Cut"]), appt("3", "18:00", "18:45", "Riley Park", ["Blowout"], "checked_in")], next: null },
    week: days(7, today).map((d, i) => ({ date: d, label: i === 0 ? "Today" : new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }), load: load(d), booked: load(d) === "closed" ? 0 : 3, freeMinutes: load(d) === "open" ? 150 : load(d) === "busy" ? 75 : 0, closedReason: closedOn(d) })),
    month: { first: "2026-12-01", days: days(42, "2026-11-29").map((d) => ({ date: d, label: d, load: load(d), booked: load(d) === "closed" ? 0 : 3, freeMinutes: 60, closedReason: closedOn(d) })) },
    inventory: [{ name: "Shades EQ Gloss 09V", level: "out", onHand: 0, vendor: "saloncentric" }, { name: "Kenra Color 6N", level: "low", onHand: 1, vendor: "saloncentric" }],
  };
  data.days = {
    [today]: data.today!.appts,
    [addDays(today, 3)]: [appt("4", "10:00", "11:30", "Avery Cole", ["Partial Highlights"]), appt("5", "13:00", "13:45", "Morgan Tate", ["Women's Cut"], "booked", "Bring inspiration photos")].map((x) => ({ ...x, start: x.start.replace(today, addDays(today, 3)), end: x.end.replace(today, addDays(today, 3)) })),
  };
  if (sp.t === "empty") {
    data.board = { columns: [], next: nextAppointmentLine({ start: at("07:15", "2026-12-05"), clientName: "Gunter Frazier", services: ["Women's Cut"] }, "2026-12-04", TZ, { anyToday: false }) };
  }
  const all: Slide[] = sp.t === "empty" ? [{ id: "b", type: "board", seconds: 30 }] : fromTemplate(tpl);
  const picked = sp.s ? [all[Number(sp.s)] ?? all[0]] : all;
  const slides = sp.bg ? picked.map((x) => ({ ...x, bgMediaId: "bg" })) : picked;
  const theme = sp.theme === "light" || sp.theme === "brand" ? sp.theme : "dark";
  const rotate = sp.r === "90" ? 90 : sp.r === "270" ? 270 : 0;
  return <ScreenPlayer name={tpl.name} slides={slides} settings={{ touch: tpl.touch, header: true, theme, rotate }} data={data} />;
}
