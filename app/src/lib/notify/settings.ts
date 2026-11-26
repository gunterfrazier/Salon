import defaults from "../../../seed/notifications.json";

export type Channel = "sms" | "email";

export interface ReminderRule {
  id: string;
  before: { hours?: number; minutes?: number; days?: number };
  channels: Channel[];
  enabled: boolean;
}

export interface Toggle {
  enabled: boolean;
  channels?: Channel[];
}

export type TemplateKey =
  | "reminder"
  | "confirmation"
  | "change"
  | "cancel"
  | "depositRequest"
  | "depositReminder"
  | "holdReleased"
  | "receipt"
  | "reviewRequest"
  | "rebookNudge";

export interface NotificationSettings {
  /** Client texts/emails that would land inside this window ("HH:MM" salon time; may wrap midnight) are moved out of it. */
  quietHours: { start: string; end: string } | null;
  client: {
    reminders: ReminderRule[];
    confirmation: Toggle;
    change: Toggle;
    cancel: Toggle;
    depositRequest: Toggle;
    receipt: Toggle;
    reviewRequest: Toggle & { afterHours: number; url: string };
    rebookNudge: Toggle & { afterWeeks: number };
  };
  stylist: {
    newOnlineBooking: Toggle;
    changeOrCancel: Toggle;
    depositReceived: Toggle;
    checkIn: Toggle;
    dayPreview: Toggle & { at: string; day: "today" | "tomorrow" };
    beforeEach: Toggle & { minutes: number };
  };
  depositHold: { releaseAfterHours: number; remindAfterHours: number };
  templates: Record<TemplateKey, string>;
  footer: string;
}

export const DEFAULT_NOTIFICATIONS = defaults as NotificationSettings;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = k in out && isObj(out[k]) && isObj(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Saved settings on top of the defaults (new options added later get their defaults). */
export function mergeNotificationSettings(stored: unknown): NotificationSettings {
  return deepMerge(DEFAULT_NOTIFICATIONS, isObj(stored) ? stored : undefined);
}

export const reminderMinutes = (r: ReminderRule) => (r.before.days ?? 0) * 1440 + (r.before.hours ?? 0) * 60 + (r.before.minutes ?? 0);

/** Human wording for a reminder offset: "2 days", "3 hours", "90 minutes". */
export function describeBefore(r: ReminderRule): string {
  const m = reminderMinutes(r);
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? "" : "s"}`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"}`;
  return `${m} minutes`;
}

/** Checks the settings a stylist saves; returns the first problem or null. */
export function validateNotificationSettings(s: NotificationSettings): string | null {
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (s.quietHours && (!hhmm.test(s.quietHours.start) || !hhmm.test(s.quietHours.end))) return "Quiet hours need times like 20:00.";
  if (s.client.reminders.length > 5) return "Up to 5 reminders.";
  for (const r of s.client.reminders) {
    const m = reminderMinutes(r);
    if (!Number.isFinite(m) || m < 15 || m > 14 * 1440) return "Reminders can be from 15 minutes to 14 days before.";
    if (r.enabled && r.channels.length === 0) return "Pick text or email for each reminder.";
  }
  if (new Set(s.client.reminders.map((r) => reminderMinutes(r))).size !== s.client.reminders.length) return "Two reminders have the same time.";
  const h = s.depositHold;
  if (!(h.releaseAfterHours >= 1 && h.releaseAfterHours <= 168)) return "Release unpaid holds after 1 to 168 hours.";
  if (!(h.remindAfterHours >= 0 && h.remindAfterHours < h.releaseAfterHours)) return "The deposit reminder must come before the hold is released.";
  if (!hhmm.test(s.stylist.dayPreview.at)) return "Day preview needs a time like 19:30.";
  for (const [k, t] of Object.entries(s.templates)) if (!t.trim() || t.length > 600) return `The ${k} message must be 1–600 characters.`;
  return null;
}
