import { money } from "../format";
import { paymentRequest } from "../payments/methods";
import { depositMethods, mergeMethods, type StoredMethods } from "../payments/settings";
import { formatDay, formatTime, wallParts } from "../time/zone";
import { renderTemplate } from "./engine";
import type { Channel, NotificationSettings, TemplateKey } from "./settings";

/** A row for the messages table (the outbox). */
export interface MessageRow {
  business_id: string;
  client_id: string | null;
  appointment_id: string | null;
  audience: "client" | "stylist";
  channel: Channel | "push";
  template: string;
  body: string;
  to_address: string | null;
  dedupe_key: string | null;
  send_after: string;
  status: "queued" | "skipped";
  error?: string;
}

export interface Recipient {
  clientId: string;
  firstName: string;
  phone: string | null;
  email: string | null;
  smsOptIn: boolean;
}

export interface SalonInfo {
  id: string;
  name: string;
  timezone: string;
  paymentMethods: StoredMethods | null;
  /** Public site address, e.g. https://chairvana.app */
  siteUrl: string;
}

export interface ApptInfo {
  id: string;
  start: Date;
  services: string[];
  depositDue: number;
}

/** "Venmo @Name or Zelle 256-555-0100": where to send a deposit, from Settings › Payments. */
export function payLine(methods: StoredMethods | null, amount: number, note: string): string {
  const list = depositMethods(mergeMethods(methods));
  const parts = list.flatMap((m) => {
    try {
      const r = paymentRequest(m, amount, note);
      return [r.url ?? r.instructions];
    } catch {
      return [];
    }
  });
  return parts.length ? parts.join(" or ") : "contact the salon";
}

export function messageVars(salon: SalonInfo, s: NotificationSettings, who: { firstName: string } | null, appt: ApptInfo | null, extra: Record<string, string | number> = {}) {
  const tz = salon.timezone;
  const date = appt ? formatDay(wallParts(appt.start, tz).date, { weekday: "short", month: "short", day: "numeric" }) : "";
  return {
    first_name: who?.firstName ?? "",
    salon: salon.name,
    services: appt?.services.join(", ") ?? "",
    date,
    time: appt ? formatTime(appt.start, tz) : "",
    deposit: appt?.depositDue ? money(appt.depositDue) : "",
    pay_link: appt?.depositDue ? payLine(salon.paymentMethods, appt.depositDue, `Deposit ${date} ${who?.firstName ?? ""}`.trim()) : "",
    hold_hours: s.depositHold.releaseAfterHours,
    book_link: `${salon.siteUrl}/book`,
    manage_link: `${salon.siteUrl}/book`,
    review_link: s.client.reviewRequest.url,
    ...extra,
  };
}

/** One row per channel. Rows that can't be sent are recorded as skipped, with the reason, so nothing is retried later by surprise. */
export function clientRows(o: {
  salon: SalonInfo;
  settings: NotificationSettings;
  to: Recipient;
  appt: ApptInfo | null;
  template: TemplateKey;
  channels: Channel[];
  key: string | null;
  sendAfter: Date;
  extra?: Record<string, string | number>;
}): MessageRow[] {
  const vars = messageVars(o.salon, o.settings, o.to, o.appt, o.extra);
  const text = renderTemplate(o.settings.templates[o.template], vars);
  return o.channels.map((channel) => {
    const address = channel === "sms" ? o.to.phone : o.to.email;
    const problem = !address ? (channel === "sms" ? "No mobile number on file" : "No email on file") : channel === "sms" && !o.to.smsOptIn ? "Client hasn't agreed to texts" : null;
    return {
      business_id: o.salon.id,
      client_id: o.to.clientId,
      appointment_id: o.appt?.id ?? null,
      audience: "client",
      channel,
      template: o.template,
      body: channel === "sms" && o.settings.footer && (o.template === "reviewRequest" || o.template === "rebookNudge") ? `${text} ${o.settings.footer}` : text,
      to_address: address,
      dedupe_key: o.key,
      send_after: o.sendAfter.toISOString(),
      status: problem ? "skipped" : "queued",
      ...(problem ? { error: problem } : {}),
    };
  });
}

/** An alert to the stylist: push notification, text, or email. */
export function stylistRow(o: { salon: SalonInfo; staff: { id?: string; phone: string | null; email: string | null; push?: boolean }; template: string; body: string; apptId: string | null; key: string | null; sendAfter: Date }): MessageRow {
  // Push to the stylist's own devices when turned on (free); otherwise text, then email.
  const channel: Channel | "push" = o.staff.push && o.staff.id ? "push" : o.staff.phone ? "sms" : "email";
  const address = channel === "push" ? o.staff.id! : (o.staff.phone ?? o.staff.email);
  return {
    business_id: o.salon.id,
    client_id: null,
    appointment_id: o.apptId,
    audience: "stylist",
    channel,
    template: o.template,
    body: o.body,
    to_address: address,
    dedupe_key: o.key,
    send_after: o.sendAfter.toISOString(),
    status: address ? "queued" : "skipped",
    ...(address ? {} : { error: "Add your phone or email to get alerts" }),
  };
}

/** Text of the stylist's day preview. */
export function dayPreviewText(salon: SalonInfo, date: string, appts: { start: Date; clientName: string; services: string[]; depositDue: number; flagged: boolean }[]): string {
  const day = formatDay(date, { weekday: "long", month: "short", day: "numeric" });
  if (!appts.length) return `${day}: nothing booked.`;
  const lines = appts.map((a) => `${formatTime(a.start, salon.timezone)} ${a.clientName}: ${a.services.join(", ")}${a.depositDue ? ` (deposit ${money(a.depositDue)} due)` : ""}${a.flagged ? " (flagged)" : ""}`);
  return `${day}, ${appts.length} appointment${appts.length === 1 ? "" : "s"}:\n${lines.join("\n")}\n${salon.siteUrl}/today?date=${date}`;
}

/** What was charged at checkout, for the receipt. */
export interface ReceiptInfo {
  lines: { name: string; cents: number }[];
  tip: number;
  depositApplied: number;
  paid: number;
  method: string | null;
  balance: number;
}

export function receiptDetails(r: ReceiptInfo): { details: string; total: string } {
  const out = r.lines.map((l) => `${l.name} ${money(l.cents)}`);
  if (r.tip) out.push(`Tip ${money(r.tip)}`);
  const total = r.lines.reduce((n, l) => n + l.cents, 0) + r.tip;
  out.push(`Total ${money(total)}`);
  if (r.depositApplied) out.push(`Deposit applied ${money(r.depositApplied)}`);
  if (r.paid) out.push(`Paid today ${money(r.paid)}${r.method ? ` (${r.method})` : ""}`);
  if (r.balance) out.push(`Balance due ${money(r.balance)}`);
  return { details: out.join("\n"), total: money(total) };
}
