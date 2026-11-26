import { notFound } from "next/navigation";
import ReportView from "@/app/app/reports/ReportView";
import { buildReport, previousRange, rangeFor, type RAppt, type RPayment } from "@/lib/reports/build";
import { addDays, zonedToUtc } from "@/lib/time/zone";

/** Development-only preview of Reports with generated sample data (404 in production). */
export const dynamic = "force-dynamic";

const TZ = "America/Chicago";
const hours = { tue: ["09:00", "17:00"], wed: ["09:00", "17:00"], thu: ["10:00", "19:00"], fri: ["09:00", "17:00"], sat: ["08:00", "14:00"] } as Record<string, [string, string]>;
const MENU = [
  { name: "Women's Cut", category: "Cut & Style", cents: 5500, mins: 60 },
  { name: "All Over Color", category: "Color Services", cents: 9500, mins: 75 },
  { name: "Full Highlights", category: "Color Services", cents: 15000, mins: 120 },
  { name: "Style", category: "Cut & Style", cents: 3500, mins: 45 },
  { name: "Toner", category: "Color Services", cents: 4000, mins: 30 },
];
const METHODS = ["venmo_direct", "cash", "zelle", "cash_app_direct"];

function sample(from: string, to: string, seed: number) {
  const appts: RAppt[] = [];
  const payments: RPayment[] = [];
  let n = seed;
  const rnd = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (![2, 3, 4, 5, 6].includes(wd)) continue;
    const count = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < count; k++) {
      const svc = MENU[Math.floor(rnd() * MENU.length)];
      const start = zonedToUtc(d, (9 + k * 2) * 60, TZ);
      const r = rnd();
      const status = r < 0.05 ? "no_show" : r < 0.1 ? "cancelled" : "completed";
      const id = `${d}-${k}`;
      appts.push({ id, clientId: `c${Math.floor(rnd() * 40)}`, start, end: new Date(start.getTime() + svc.mins * 60000), status, bookedVia: rnd() < 0.4 ? "online" : "stylist", createdAt: new Date(start.getTime() - 7 * 86400000), cancelledBy: status === "cancelled" ? "client" : null, cancelReason: null, lines: [{ name: svc.name, category: svc.category, cents: svc.cents }], busyMinutes: svc.mins });
      if (status === "completed") {
        const method = METHODS[Math.floor(rnd() * METHODS.length)];
        payments.push({ kind: "service", method, cents: svc.cents, at: start, status: "succeeded" });
        payments.push({ kind: "tip", method, cents: Math.round(svc.cents * 0.2), at: start, status: "succeeded" });
      }
      if (status === "no_show") payments.push({ kind: "no_show_fee", method: "cash", cents: svc.cents, at: start, status: "succeeded" });
    }
  }
  return buildReport({ tz: TZ, from, to, hours, isClosed: () => false, appts, payments, returningClientIds: new Set(Array.from({ length: 30 }, (_, i) => `c${i}`)), bookingsMade: [], balancesOwed: 6250 });
}

export default async function DevReports({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const key = ((await searchParams).range ?? "month") as Parameters<typeof rangeFor>[0];
  const r = rangeFor(key, "2026-11-26");
  const p = previousRange(r);
  return <ReportView r={sample(r.from, r.to, 7)} prev={sample(p.from, p.to, 3)} range={key} zone="Central Time (CST)" basePath="/dev/reports" />;
}
