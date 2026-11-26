/**
 * Message delivery. Texts go through Twilio, email through Resend. Each is
 * switched on just by setting its keys in Cloudflare (Settings › Variables and
 * Secrets); until then messages are recorded as "not connected".
 *
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM (+1...)
 *   RESEND_API_KEY, EMAIL_FROM (e.g. "Intensity Salon <hello@chairvana.app>")
 */

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** Worth trying again later (network trouble, rate limit). */
  retry?: boolean;
}

export interface Sender {
  sms: ((to: string, body: string) => Promise<SendResult>) | null;
  email: ((to: string, subject: string, body: string) => Promise<SendResult>) | null;
}

/** US numbers to E.164 (+12565550101); anything already starting with + is kept. */
export function toE164(phone: string): string | null {
  const t = phone.trim();
  const digits = t.replace(/\D/g, "");
  if (t.startsWith("+")) return digits.length >= 8 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

const env = (k: string) => (process.env[k] ?? "").trim();

export function configuredSender(fetcher: typeof fetch = fetch): Sender {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const service = env("TWILIO_MESSAGING_SERVICE_SID");
  const from = env("TWILIO_FROM");
  const resend = env("RESEND_API_KEY");
  const emailFrom = env("EMAIL_FROM");

  const sms =
    sid && token && (service || from)
      ? async (to: string, body: string): Promise<SendResult> => {
          const num = toE164(to);
          if (!num) return { ok: false, error: "Phone number isn't valid" };
          const form = new URLSearchParams({ To: num, Body: body });
          if (service) form.set("MessagingServiceSid", service);
          else form.set("From", from);
          try {
            const res = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
              method: "POST",
              headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
              body: form,
            });
            const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
            if (res.ok) return { ok: true, id: j.sid };
            return { ok: false, error: `Twilio ${j.code ?? res.status}: ${j.message ?? res.statusText}`.slice(0, 300), retry: res.status === 429 || res.status >= 500 };
          } catch (e) {
            return { ok: false, error: `Twilio unreachable: ${(e as Error).message}`.slice(0, 300), retry: true };
          }
        }
      : null;

  const email =
    resend && emailFrom
      ? async (to: string, subject: string, body: string): Promise<SendResult> => {
          try {
            const res = await fetcher("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: emailFrom, to: [to], subject, text: body }),
            });
            const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
            if (res.ok) return { ok: true, id: j.id };
            return { ok: false, error: `Email ${res.status}: ${j.message ?? res.statusText}`.slice(0, 300), retry: res.status === 429 || res.status >= 500 };
          } catch (e) {
            return { ok: false, error: `Email unreachable: ${(e as Error).message}`.slice(0, 300), retry: true };
          }
        }
      : null;

  return { sms, email };
}
