import policyJson from "../../../seed/policies.json";
import { StatusChip, statusVars } from "@/components/StatusChip";
import { bookingAlert, type BookingAlert } from "@/lib/policy/flags";
import type { PolicySettings } from "@/lib/policy/types";
import { planAppointment } from "@/lib/schedule/plan";
import { servicesByKey as services } from "@/lib/menu";
import { PHASE_CHART, STATUS_CHART, type StatusKey } from "@/lib/ui/status-colors";

export const metadata = { title: "Color Chart" };

const policy = policyJson as unknown as PolicySettings;

const familyTitle = {
  violation: "Violations — payment required",
  warning: "Warnings — heads-up only",
  money: "Money owed",
  action: "Action needed",
  info: "Info",
} as const;

// Sample data for the previews below.
const now = new Date("2026-11-25T12:00:00Z");
const d = (s: string) => new Date(s);
const sampleAlerts: { status: StatusKey; alert: BookingAlert }[] = [
  {
    status: "no_show",
    alert: bookingAlert("Jamie R.", {
      onTimeVisits: [d("2026-10-10T15:00:00Z")], priorVisitCount: 6, outstandingBalance: 0,
      flags: [{ id: "f1", type: "no_show", createdAt: d("2026-09-12T16:00:00Z"), appointmentStart: d("2026-09-12T15:00:00Z"), appointmentSummary: "Full Highlights", feeCharged: 12500, permanent: false }],
    }, policy, now)!,
  },
  {
    status: "past_violation",
    alert: bookingAlert("Morgan T.", {
      onTimeVisits: ["2026-03-01", "2026-04-12", "2026-05-24", "2026-07-05"].map((x) => d(`${x}T15:00:00Z`)), priorVisitCount: 10, outstandingBalance: 0,
      flags: [{ id: "f2", type: "late_cancel", createdAt: d("2026-02-10T12:00:00Z"), appointmentStart: d("2026-02-11T15:00:00Z"), permanent: false }],
    }, policy, now)!,
  },
];

const start = d("2026-11-28T15:00:00Z");
const plan = planAppointment(start, [services.all_over_color, services.olaplex]);
const t = (x: Date) => x.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

export default function LegendPage() {
  const families = ["violation", "warning", "money", "action", "info"] as const;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-10">
      <header>
        <h1 className="text-2xl font-bold">Color chart</h1>
        <p className="text-muted mt-1">How client flags, warnings and appointment status appear on the calendar, client cards and alerts.</p>
      </header>

      {families.map((fam) => (
        <section key={fam}>
          <h2 className="text-lg font-semibold mb-3">{familyTitle[fam]}</h2>
          <ul className="space-y-2">
            {STATUS_CHART.filter((s) => s.family === fam).map((s) => (
              <li key={s.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 rounded-lg border border-line bg-surface p-3">
                <div className="sm:w-56 shrink-0"><StatusChip status={s.key} /></div>
                <p className="text-sm text-muted">{s.meaning}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section>
        <h2 className="text-lg font-semibold mb-3">Booking alerts (sample)</h2>
        <p className="text-sm text-muted mb-3">Sent to you when a client with any violation history books. Tap “View history” to see each violation.</p>
        <div className="space-y-3">
          {sampleAlerts.map(({ status, alert }) => (
            <div key={alert.title} className="status rounded-lg p-4" style={statusVars(status)}>
              <p className="font-bold">{alert.title}</p>
              <p className="text-sm mt-1">{alert.message}</p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-semibold underline">View history</summary>
                <ul className="mt-2 space-y-1">
                  {alert.history.map((h) => (
                    <li key={h.flag.id}>
                      {h.flag.type === "no_show" ? "No-show" : "Late cancellation"} —{" "}
                      {h.flag.appointmentStart.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}
                      {h.flag.appointmentSummary ? ` · ${h.flag.appointmentSummary}` : ""}
                      {h.flag.feeCharged ? ` · $${(h.flag.feeCharged / 100).toFixed(2)} charged` : ""}
                      {" · "}
                      {h.state === "resolved" ? `cleared (${h.resolvedBy === "visits" ? `${h.onTimeVisitsSince} on-time visits` : h.resolvedBy})` : h.state === "permanent" ? "permanent" : `active, ${h.visitsRemaining} visits to clear`}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Calendar block (sample stacked appointment)</h2>
        <p className="text-sm text-muted mb-3">
          {plan.lines.map((l) => l.name).join(" + ")} · {t(plan.start)}–{t(plan.end)} · {plan.totalMinutes} min · est. ${(plan.estimatedTotal / 100).toFixed(2)}{plan.priceMayVary ? "+" : ""}
        </p>
        <div className="rounded-lg border-2 border-line bg-surface overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
            <span className="font-semibold">Jamie R.</span>
            <StatusChip status="no_show" text="No-show · 3 visits to clear" />
            <StatusChip status="deposit_paid" text="Paid in full" />
          </div>
          {plan.lines.flatMap((l) =>
            l.segments.map((g) => (
              <div
                key={`${l.serviceKey}-${g.phase}`}
                className={`flex justify-between gap-2 px-3 text-sm border-b border-line last:border-0 ${g.phase === "processing" ? "processing-stripes" : ""}`}
                style={{ minHeight: `${Math.max(28, ((g.end.getTime() - g.start.getTime()) / 60000) * 0.6)}px`, alignItems: "center" }}
              >
                <span>{l.name} · {PHASE_CHART.find((p) => p.key === g.phase)!.label}</span>
                <span className="text-muted tabular-nums whitespace-nowrap">{t(g.start)}–{t(g.end)}</span>
              </div>
            )),
          )}
        </div>
        <ul className="mt-3 text-sm text-muted space-y-1">
          {PHASE_CHART.map((p) => (
            <li key={p.key}><span className="font-semibold text-foreground">{p.label}</span>{p.pattern === "striped" ? " (striped)" : ""}: {p.meaning}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
