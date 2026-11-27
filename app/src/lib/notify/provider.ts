/**
 * Message delivery. Texts go through Twilio. Email goes through the first one
 * that's set up, in this order:
 *   1. Cloudflare Email Service: the Worker's "EMAIL" send_email binding (no key needed)
 *   2. Brevo: BREVO_API_KEY (free plan: 300 emails a day)
 *   3. Resend: RESEND_API_KEY
 * Each is switched on by its binding or key in Cloudflare (Settings › Variables
 * and Secrets); until then messages are recorded as "not connected".
 *
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM (+1...)
 *   EMAIL_FROM: the sending address, e.g. bookings@mail.chairvana.app (a "Name <addr>"
 *   form is fine too). The salon's name is used as the display name.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { brandedEmail } from "./email-html";

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** Worth trying again later (network trouble, rate limit). */
  retry?: boolean;
}

export interface Sender {
  sms: ((to: string, body: string) => Promise<SendResult>) | null;
  email: ((to: string, subject: string, body: string, opts?: EmailOpts) => Promise<SendResult>) | null;
}

export interface EmailOpts {
  /** Display name, e.g. the salon ("Intensity Salon"). */
  fromName?: string | null;
  replyTo?: string | null;
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

/** "Name <a@b.c>" or "a@b.c" → parts. */
export function parseAddress(s: string): { email: string; name: string | null } | null {
  const m = s.trim().match(/^(?:"?([^"<]*?)"?\s*<)?([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>?$/);
  return m ? { email: m[2], name: m[1]?.trim() || null } : null;
}

type EmailBinding = { send: (m: Record<string, unknown>) => Promise<{ messageId?: string }> };

/** The Worker's Cloudflare Email Service binding, when deployed with one. */
function emailBinding(): EmailBinding | null {
  try {
    const b = (getCloudflareContext().env as Record<string, unknown>).EMAIL as EmailBinding | undefined;
    return b && typeof b.send === "function" ? b : null;
  } catch {
    return null;
  }
}

export function configuredSender(fetcher: typeof fetch = fetch, binding: EmailBinding | null = emailBinding()): Sender {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const service = env("TWILIO_MESSAGING_SERVICE_SID");
  const from = env("TWILIO_FROM");
  const resend = env("RESEND_API_KEY");
  // Default sender for the Cloudflare sending domain set up for Chairvana.
  const emailFrom = env("EMAIL_FROM") || (binding ? "bookings@mail.chairvana.app" : "");

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

  const brevo = env("BREVO_API_KEY");
  const fromAddr = parseAddress(emailFrom);
  const site = env("SITE_URL") || "https://chairvana.app";
  const shape = (to: string, subject: string, body: string, o: EmailOpts = {}) => {
    const name = (o.fromName ?? fromAddr?.name ?? "Chairvana").replace(/[<>"\r\n]/g, "").slice(0, 80);
    return { from: { email: fromAddr!.email, name }, to, subject, text: body, html: brandedEmail({ text: body, salon: o.fromName ?? null, site }), replyTo: o.replyTo ?? null };
  };
  const fail = (who: string, status: number, msg: string) => ({ ok: false, error: `${who} ${status}: ${msg}`.slice(0, 300), retry: status === 429 || status >= 500 });

  let email: Sender["email"] = null;
  if (fromAddr && binding) {
    email = async (to, subject, body, o) => {
      const m = shape(to, subject, body, o);
      try {
        const r = await binding.send({ from: m.from, to: m.to, subject: m.subject, text: m.text, html: m.html, ...(m.replyTo ? { replyTo: m.replyTo } : {}) });
        return { ok: true, id: r?.messageId };
      } catch (e) {
        const code = (e as { code?: string }).code ?? "";
        return { ok: false, error: `Email ${code || "error"}: ${(e as Error).message}`.slice(0, 300), retry: !/RECIPIENT|SENDER|INVALID|PLAN/.test(code) };
      }
    };
  } else if (fromAddr && brevo) {
    email = async (to, subject, body, o) => {
      const m = shape(to, subject, body, o);
      try {
        const res = await fetcher("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": brevo, "Content-Type": "application/json", accept: "application/json" },
          body: JSON.stringify({ sender: m.from, to: [{ email: to }], subject, textContent: m.text, htmlContent: m.html, ...(m.replyTo ? { replyTo: { email: m.replyTo } } : {}) }),
        });
        const j = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
        return res.ok ? { ok: true, id: j.messageId } : fail("Email", res.status, j.message ?? res.statusText);
      } catch (e) {
        return { ok: false, error: `Email unreachable: ${(e as Error).message}`.slice(0, 300), retry: true };
      }
    };
  } else if (fromAddr && resend) {
    email = async (to, subject, body, o) => {
      const m = shape(to, subject, body, o);
      try {
        const res = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `${m.from.name} <${m.from.email}>`, to: [to], subject, text: m.text, html: m.html, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
        });
        const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
        return res.ok ? { ok: true, id: j.id } : fail("Email", res.status, j.message ?? res.statusText);
      } catch (e) {
        return { ok: false, error: `Email unreachable: ${(e as Error).message}`.slice(0, 300), retry: true };
      }
    };
  }

  return { sms, email };
}
