import { type NextRequest } from "next/server";
import { requirePermission } from "@/lib/context";
import { loadReportRows } from "@/lib/data/reports";
import { HOLD_RELEASED, toCsv } from "@/lib/reports/build";
import { todayIn, tzAbbrev, wallParts } from "@/lib/time/zone";
import { parseRange } from "../range";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { completed: "Completed", booked: "Booked", confirmed: "Booked", pending: "Waiting on deposit", no_show: "No-show", cancelled: "Cancelled", checked_in: "Checked in", in_service: "In chair" };
const KIND: Record<string, string> = { service: "Service", tip: "Tip", deposit: "Deposit", cancel_fee: "Late-cancel fee", no_show_fee: "No-show fee", balance: "Balance paid", retail: "Retail", refund: "Refund", gift_card: "Gift card sold", package: "Package sold" };
const METHOD: Record<string, string> = { cash: "Cash", venmo_direct: "Venmo", cash_app_direct: "Cash App", zelle: "Zelle", paypal_me: "PayPal", apple_cash: "Apple Cash", gift_card: "Gift card", other: "Other" };
const dollars = (c: number) => (c / 100).toFixed(2);

/** CSV downloads for a date range: appointments, payments, or services sold. */
export async function GET(req: NextRequest) {
  const ctx = await requirePermission("reports.view");
  const tz = ctx.business.timezone;
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const r = parseRange({ range: "custom", from: sp.from, to: sp.to }, todayIn(tz));
  const type = ["appointments", "payments", "services"].includes(sp.type) ? sp.type : "appointments";
  const rows = await loadReportRows(ctx.supabase, ctx.business, r.from, r.to);
  const when = (d: Date) => {
    const w = wallParts(d, tz);
    return [w.date, `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")} ${tzAbbrev(d, tz)}`];
  };

  let table: (string | number | null)[][];
  if (type === "payments") {
    table = [
      ["Date", "Time", "Client", "Type", "Method", "Amount", "Status", "Reference"],
      ...rows.payments.map((p) => [...when(p.at), p.clientName, KIND[p.kind] ?? p.kind, METHOD[p.method] ?? p.method, dollars(p.cents), p.status, p.reference]),
    ];
  } else if (type === "services") {
    table = [
      ["Date", "Time", "Client", "Service", "Category", "Price"],
      ...rows.appts.filter((a) => a.status === "completed").flatMap((a) => a.lines.map((l) => [...when(a.start), a.clientName, l.name, l.category, dollars(l.cents)])),
    ];
  } else {
    table = [
      ["Date", "Time", "Client", "Services", "Total", "Status", "Booked", "Cancelled by", "Reason"],
      ...rows.appts.map((a) => [
        ...when(a.start),
        a.clientName,
        a.lines.map((l) => l.name).join("; "),
        dollars(a.lines.reduce((n, l) => n + l.cents, 0)),
        a.cancelReason === HOLD_RELEASED ? "Hold released" : (STATUS[a.status] ?? a.status),
        a.bookedVia === "online" ? "Online" : "By stylist",
        a.cancelledBy,
        a.cancelReason,
      ]),
    ];
  }

  const name = `${ctx.business.name.replace(/[^\w]+/g, "-")}-${type}-${r.from}-to-${r.to}.csv`;
  return new Response("﻿" + toCsv(table) + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
