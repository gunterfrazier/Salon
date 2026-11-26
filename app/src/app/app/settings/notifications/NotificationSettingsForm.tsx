"use client";

import { useState, useTransition } from "react";
import { PLACEHOLDERS, renderTemplate, smsSegments } from "@/lib/notify/engine";
import { DEFAULT_NOTIFICATIONS, describeBefore, reminderMinutes, type Channel, type NotificationSettings, type ReminderRule, type TemplateKey } from "@/lib/notify/settings";
import { formatMinutes, parseHHMM, tzAbbrev } from "@/lib/time/zone";
import { saveNotificationSettings } from "./actions";

type Unit = "minutes" | "hours" | "days";

const TEMPLATE_LABEL: Record<TemplateKey, string> = {
  reminder: "Appointment reminder",
  confirmation: "Booking confirmation",
  change: "Appointment changed",
  cancel: "Appointment cancelled",
  depositRequest: "Deposit request",
  depositReminder: "Deposit reminder",
  holdReleased: "Unpaid hold released",
  receipt: "Receipt",
  reviewRequest: "Review request",
  rebookNudge: "Time to rebook",
  waitlistOffer: "Waitlist: a time opened",
  formRequest: "Forms to fill in",
};

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-600" : "bg-stone-400 dark:bg-stone-600"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Channels({ value, onChange }: { value: Channel[]; onChange: (v: Channel[]) => void }) {
  const flip = (c: Channel) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <>
      {(["sms", "email"] as const).map((c) => (
        <label key={c} className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={value.includes(c)} onChange={() => flip(c)} className="h-4 w-4" />
          {c === "sms" ? "Text" : "Email"}
        </label>
      ))}
    </>
  );
}

const input = "rounded-lg border border-line bg-background px-2 py-1.5 text-sm";

function splitBefore(r: ReminderRule): { n: number; unit: Unit } {
  const m = reminderMinutes(r);
  return m % 1440 === 0 ? { n: m / 1440, unit: "days" } : m % 60 === 0 ? { n: m / 60, unit: "hours" } : { n: m, unit: "minutes" };
}

export default function NotificationSettingsForm({ initial, salon, timezone, connected }: { initial: NotificationSettings; salon: string; timezone: string; connected: { sms: boolean; email: boolean } }) {
  const [s, setS] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [dirty, setDirty] = useState(false);
  const tz = tzAbbrev(new Date(), timezone);

  const update = (fn: (d: NotificationSettings) => void) => {
    setS((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
    setStatus(null);
  };

  const save = () =>
    startSaving(async () => {
      const r = await saveNotificationSettings(s);
      setStatus(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
      if (r.ok) setDirty(false);
    });

  const sample = {
    first_name: "Jamie",
    salon,
    services: "All Over Color, Style",
    date: "Tue, Dec 1",
    time: `10:30 AM ${tz}`,
    deposit: "$50",
    pay_link: "Venmo @YourSalon",
    hold_hours: s.depositHold.releaseAfterHours,
    total: "$123.50",
    manage_link: "chairvana.app/book",
    book_link: "chairvana.app/book",
    review_link: s.client.reviewRequest.url || "(your review link)",
    weeks: s.client.rebookNudge.afterWeeks,
    openings: "Fri, Dec 4 at 10 AM, Fri, Dec 11 at 9:30 AM",
    waitlist_link: "chairvana.app/s/your-salon/book",
    forms: "New client form, Patch test & color consent",
    form_link: "chairvana.app/f/…",
  };

  const reminders = [...s.client.reminders].sort((a, b) => reminderMinutes(b) - reminderMinutes(a));

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="text-sm text-muted">Reminders and notices for clients, and alerts for you. All times are salon time ({tz}).</p>
      </div>

      {(!connected.sms || !connected.email) && (
        <p className="rounded-xl border border-line bg-surface p-3 text-sm">
          <strong>
            {!connected.sms && !connected.email ? "Texting and email aren't" : !connected.sms ? "Texting isn't" : "Email isn't"} connected yet.
          </strong>{" "}
          Your choices save now. Until it&apos;s set up, those messages are logged as &ldquo;not sent&rdquo; below instead of piling up.
        </p>
      )}

      <Section title="Appointment reminders" hint="Sent to clients before each appointment. Up to 5.">
        {reminders.map((r) => {
          const { n, unit } = splitBefore(r);
          const setBefore = (nn: number, uu: Unit) =>
            update((d) => {
              const t = d.client.reminders.find((x) => x.id === r.id)!;
              t.before = uu === "days" ? { days: nn } : uu === "hours" ? { hours: nn } : { minutes: nn };
            });
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
              <Switch label={`Reminder ${describeBefore(r)} before`} on={r.enabled} onChange={(v) => update((d) => void (d.client.reminders.find((x) => x.id === r.id)!.enabled = v))} />
              <input type="number" min={1} aria-label="How long before" className={`${input} w-20`} value={n} onChange={(e) => setBefore(Math.max(1, Number(e.target.value) || 1), unit)} />
              <select aria-label="Unit" className={input} value={unit} onChange={(e) => setBefore(n, e.target.value as Unit)}>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
              <span className="text-sm">before by</span>
              <Channels value={r.channels} onChange={(v) => update((d) => void (d.client.reminders.find((x) => x.id === r.id)!.channels = v))} />
              <button type="button" className="ml-auto text-sm underline" onClick={() => update((d) => void (d.client.reminders = d.client.reminders.filter((x) => x.id !== r.id)))}>
                Remove
              </button>
            </div>
          );
        })}
        {s.client.reminders.length < 5 && (
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-background"
            onClick={() => update((d) => void d.client.reminders.push({ id: `r${Date.now().toString(36)}`, before: { days: 1 }, channels: ["sms"], enabled: true }))}
          >
            + Add reminder
          </button>
        )}
      </Section>

      <Section title="Quiet hours" hint="No client texts or emails during these hours. Reminders go out just before quiet hours start; notices wait until they end.">
        <Row label="Use quiet hours">
          <Switch label="Quiet hours" on={!!s.quietHours} onChange={(v) => update((d) => void (d.quietHours = v ? { start: "20:00", end: "08:00" } : null))} />
        </Row>
        {s.quietHours && (
          <Row label="Quiet from" hint={`${formatMinutes(parseHHMM(s.quietHours.start))} to ${formatMinutes(parseHHMM(s.quietHours.end))} ${tz}`}>
            <input type="time" aria-label="Quiet hours start" className={input} value={s.quietHours.start} onChange={(e) => update((d) => void (d.quietHours!.start = e.target.value))} />
            <span className="text-sm">to</span>
            <input type="time" aria-label="Quiet hours end" className={input} value={s.quietHours.end} onChange={(e) => update((d) => void (d.quietHours!.end = e.target.value))} />
          </Row>
        )}
      </Section>

      <Section title="Client messages">
        {(
          [
            ["confirmation", "Booking confirmation", "Right after a booking is made"],
            ["change", "Appointment changed", "When you move an appointment"],
            ["cancel", "Appointment cancelled", "When an appointment is cancelled"],
            ["depositRequest", "Deposit request", "When a booking needs a deposit"],
            ["receipt", "Receipt", "After checkout"],
            ["forms", "Forms to fill in", "When a booking needs a form (Settings → Forms)"],
            ["waitlist", "Waitlist offers", "When a time opens for someone on the waitlist (at most once a day each)"],
          ] as const
        ).map(([k, label, hint]) => (
          <Row key={k} label={label} hint={hint}>
            <Channels value={s.client[k].channels ?? []} onChange={(v) => update((d) => void (d.client[k].channels = v))} />
            <Switch label={label} on={s.client[k].enabled} onChange={(v) => update((d) => void (d.client[k].enabled = v))} />
          </Row>
        ))}
        <Row label="Review request" hint="Asks happy clients for a review after their visit">
          <input type="number" min={1} max={72} aria-label="Hours after checkout" className={`${input} w-16`} value={s.client.reviewRequest.afterHours} onChange={(e) => update((d) => void (d.client.reviewRequest.afterHours = Number(e.target.value) || 1))} />
          <span className="text-sm">hours after</span>
          <Switch label="Review request" on={s.client.reviewRequest.enabled} onChange={(v) => update((d) => void (d.client.reviewRequest.enabled = v))} />
        </Row>
        {s.client.reviewRequest.enabled && (
          <input type="url" placeholder="Review link, e.g. your Google review page" aria-label="Review link" className={`${input} w-full`} value={s.client.reviewRequest.url} onChange={(e) => update((d) => void (d.client.reviewRequest.url = e.target.value))} />
        )}
        <Row label="Time to rebook" hint="If a client hasn't booked again">
          <input type="number" min={1} max={52} aria-label="Weeks since last visit" className={`${input} w-16`} value={s.client.rebookNudge.afterWeeks} onChange={(e) => update((d) => void (d.client.rebookNudge.afterWeeks = Number(e.target.value) || 1))} />
          <span className="text-sm">weeks</span>
          <Switch label="Time to rebook" on={s.client.rebookNudge.enabled} onChange={(v) => update((d) => void (d.client.rebookNudge.enabled = v))} />
        </Row>
      </Section>

      <Section title="Unpaid deposit holds" hint="Online bookings that need a deposit hold the time until it arrives.">
        <Row label="Remind the client after">
          <input type="number" min={0} aria-label="Remind after hours" className={`${input} w-16`} value={s.depositHold.remindAfterHours} onChange={(e) => update((d) => void (d.depositHold.remindAfterHours = Number(e.target.value) || 0))} />
          <span className="text-sm">hours (0 = don&apos;t)</span>
        </Row>
        <Row label="Release the time after" hint="Always released at least an hour before the appointment">
          <input type="number" min={1} max={168} aria-label="Release after hours" className={`${input} w-16`} value={s.depositHold.releaseAfterHours} onChange={(e) => update((d) => void (d.depositHold.releaseAfterHours = Number(e.target.value) || 1))} />
          <span className="text-sm">hours</span>
        </Row>
      </Section>

      <Section title="Alerts for you" hint="Sent to your phone.">
        {(
          [
            ["newOnlineBooking", "New online booking"],
            ["changeOrCancel", "Client changes or cancels"],
            ["depositReceived", "Deposit marked received"],
            ["checkIn", "Client checks in at the kiosk"],
            ["waitlistJoined", "Someone joins the waitlist online"],
          ] as const
        ).map(([k, label]) => (
          <Row key={k} label={label}>
            <Switch label={label} on={s.stylist[k].enabled} onChange={(v) => update((d) => void (d.stylist[k].enabled = v))} />
          </Row>
        ))}
        <Row label="Day preview" hint="Your list of clients and services">
          <select aria-label="Which day" className={input} value={s.stylist.dayPreview.day} onChange={(e) => update((d) => void (d.stylist.dayPreview.day = e.target.value as "today" | "tomorrow"))}>
            <option value="tomorrow">Tomorrow&apos;s, the evening before</option>
            <option value="today">Today&apos;s, that morning</option>
          </select>
          <span className="text-sm">at</span>
          <input type="time" aria-label="Day preview time" className={input} value={s.stylist.dayPreview.at} onChange={(e) => update((d) => void (d.stylist.dayPreview.at = e.target.value))} />
          <Switch label="Day preview" on={s.stylist.dayPreview.enabled} onChange={(v) => update((d) => void (d.stylist.dayPreview.enabled = v))} />
        </Row>
        <Row label="Before each appointment">
          <input type="number" min={5} max={120} aria-label="Minutes before" className={`${input} w-16`} value={s.stylist.beforeEach.minutes} onChange={(e) => update((d) => void (d.stylist.beforeEach.minutes = Number(e.target.value) || 5))} />
          <span className="text-sm">minutes before</span>
          <Switch label="Before each appointment" on={s.stylist.beforeEach.enabled} onChange={(v) => update((d) => void (d.stylist.beforeEach.enabled = v))} />
        </Row>
      </Section>

      <Section title="Message wording" hint="Words in {braces} are filled in for each client. The preview uses sample details.">
        <details className="text-sm">
          <summary className="cursor-pointer underline">What can I use?</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {Object.entries(PLACEHOLDERS).map(([k, v]) => (
              <li key={k}>
                <code>{`{${k}}`}</code> — {v}
              </li>
            ))}
          </ul>
        </details>
        {(Object.keys(TEMPLATE_LABEL) as TemplateKey[]).map((k) => {
          const preview = renderTemplate(s.templates[k], sample);
          const segs = smsSegments(preview);
          return (
            <div key={k} className="border-t border-line pt-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`tpl-${k}`} className="text-sm font-medium">
                  {TEMPLATE_LABEL[k]}
                </label>
                {s.templates[k] !== DEFAULT_NOTIFICATIONS.templates[k] && (
                  <button type="button" className="text-xs underline" onClick={() => update((d) => void (d.templates[k] = DEFAULT_NOTIFICATIONS.templates[k]))}>
                    Reset to default
                  </button>
                )}
              </div>
              <textarea id={`tpl-${k}`} rows={3} maxLength={600} className={`${input} mt-1 w-full`} value={s.templates[k]} onChange={(e) => update((d) => void (d.templates[k] = e.target.value))} />
              <p className="mt-1 rounded-lg bg-background p-2 text-sm">{preview}</p>
              <p className={`mt-0.5 text-xs ${segs > 2 ? "font-semibold" : "text-muted"}`}>
                {preview.length} characters · {segs} text{segs === 1 ? "" : "s"}
                {segs > 2 && " — long messages cost more to send"}
              </p>
            </div>
          );
        })}
      </Section>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
          {status && (
            <p role="status" className={`text-sm ${status.ok ? "" : "font-semibold"}`}>
              {status.text}
            </p>
          )}
          {dirty && !status && <p className="text-sm text-muted">Unsaved changes</p>}
          <button type="button" onClick={save} disabled={saving || !dirty} className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </main>
  );
}
