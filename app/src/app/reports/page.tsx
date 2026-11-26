import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { loadReport } from "@/lib/data/reports";
import { previousRange } from "@/lib/reports/build";
import { todayIn, zoneLabel } from "@/lib/time/zone";
import ReportView from "./ReportView";
import { parseRange } from "./range";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const ctx = await requirePermission("reports.view");
  const tz = ctx.business.timezone;
  const r = parseRange(await searchParams, todayIn(tz));
  const before = previousRange(r);
  const [report, prev] = await Promise.all([loadReport(ctx.supabase, ctx.business, r.from, r.to), loadReport(ctx.supabase, ctx.business, before.from, before.to)]);
  return (
    <>
      <AppNav current="/reports" businessName={ctx.business.name} />
      <ReportView r={report} prev={prev} range={r.key} zone={zoneLabel(tz)} />
    </>
  );
}
