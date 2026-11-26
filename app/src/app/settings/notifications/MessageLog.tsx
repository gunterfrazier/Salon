import { formatDateTime } from "@/lib/time/zone";

export interface LogRow {
  id: string;
  createdAt: string;
  sentAt: string | null;
  audience: string;
  channel: string;
  template: string;
  status: string;
  error: string | null;
  to: string;
  body: string;
}

const LABEL: Record<string, string> = {
  reminder: "Reminder",
  confirmation: "Confirmation",
  change: "Changed",
  cancel: "Cancelled",
  depositRequest: "Deposit request",
  depositReminder: "Deposit reminder",
  holdReleased: "Hold released",
  receipt: "Receipt",
  reviewRequest: "Review request",
  rebookNudge: "Time to rebook",
  stylistNewBooking: "New booking alert",
  stylistHoldReleased: "Hold released alert",
  stylistBeforeEach: "Next client alert",
  stylistDayPreview: "Day preview",
  stylistCheckIn: "Check-in alert",
};

const STATUS: Record<string, string> = { queued: "Waiting", sending: "Sending", sent: "Sent", delivered: "Delivered", failed: "Failed", skipped: "Not sent" };

/** The last messages the app sent or tried to send, newest first. */
export default function MessageLog({ rows, timezone }: { rows: LogRow[]; timezone: string }) {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-32">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Recent messages</h2>
        <p className="mt-0.5 text-sm text-muted">The last 30 messages, newest first. &ldquo;Not sent&rdquo; shows why.</p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm">Nothing yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3">
                    <span>
                      <span className="font-medium">{LABEL[r.template] ?? r.template}</span> to {r.to} · {r.channel === "sms" ? "text" : "email"}
                    </span>
                    <span className={r.status === "failed" ? "font-semibold" : "text-muted"}>
                      {STATUS[r.status] ?? r.status}
                      {r.error ? `: ${r.error}` : ""} · {formatDateTime(new Date(r.sentAt ?? r.createdAt), timezone)}
                    </span>
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-background p-2">{r.body}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
