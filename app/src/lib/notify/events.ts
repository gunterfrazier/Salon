import "server-only";
import { createAdminClient } from "../supabase/admin";
import { money } from "../format";
import { formatDay, formatTime, wallParts } from "../time/zone";
import { afterQuiet } from "./engine";
import { clientRows, receiptDetails, stylistRow, type MessageRow, type ReceiptInfo } from "./outbox";
import { configuredSender } from "./provider";
import { contactFor, deliverQueued, loadBusinesses } from "./run";

export type AppointmentEvent = "booked_online" | "booked_by_stylist" | "cancelled" | "moved" | "checked_out" | "checked_in";


const siteUrl = () => process.env.SITE_URL ?? "https://chairvana.app";

/**
 * Queue (and try to send right away) the messages for something that just
 * happened to an appointment. Never throws: a messaging problem must not undo
 * or block a booking.
 */
export async function notifyAppointment(businessId: string, appointmentId: string, event: AppointmentEvent, receipt?: ReceiptInfo, opts: { byClient?: boolean; note?: string } = {}): Promise<void> {
  try {
    const db = createAdminClient();
    const [b] = await loadBusinesses(db, siteUrl(), businessId);
    if (!b) return;
    const { salon, settings: s } = b;
    const { data: a, error } = await db
      .from("appointments")
      .select("id,staff_id,client_id,start_at,status,deposit_required_cents,clients(first_name,last_name,phone,email,sms_opt_in),appointment_services(sort,services(name))")
      .eq("business_id", businessId)
      .eq("id", appointmentId)
      .single();
    if (error || !a) return;
    const { data: pays } = await db.from("payments").select("amount_cents").eq("appointment_id", appointmentId).eq("kind", "deposit").eq("status", "succeeded");
    const paid = (pays ?? []).reduce((n, p) => n + p.amount_cents, 0);

    type Row = { first_name: string; last_name: string | null; phone: string | null; email: string | null; sms_opt_in: boolean };
    const c = a.clients as unknown as Row | null;
    const lines = (a.appointment_services as unknown as { sort: number; services: { name: string } | null }[]) ?? [];
    const appt = {
      id: a.id,
      start: new Date(a.start_at),
      services: [...lines].sort((x, y) => x.sort - y.sort).map((l) => l.services?.name ?? "Service"),
      depositDue: Math.max(0, a.deposit_required_cents - paid),
    };
    const to = { clientId: a.client_id, firstName: c?.first_name ?? "", phone: c?.phone ?? null, email: c?.email ?? null, smsOptIn: !!c?.sms_opt_in };
    const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "A client";
    const when = `${formatDay(wallParts(appt.start, salon.timezone).date, { weekday: "short", month: "short", day: "numeric" })} ${formatTime(appt.start, salon.timezone)}`;
    const now = new Date();
    const rows: MessageRow[] = [];
    const client = (template: "confirmation" | "depositRequest" | "cancel" | "change" | "receipt" | "reviewRequest", channels: ("sms" | "email")[] | undefined, key: string, sendAfter = now, extra?: Record<string, string>) =>
      rows.push(...clientRows({ salon, settings: s, to, appt, template, channels: channels ?? ["sms"], key, sendAfter, extra }));

    if (event === "booked_online" || event === "booked_by_stylist") {
      if (a.status === "pending" && appt.depositDue > 0) {
        if (s.client.depositRequest.enabled) client("depositRequest", s.client.depositRequest.channels, `deposit-request:${a.id}`);
      } else if (s.client.confirmation.enabled) client("confirmation", s.client.confirmation.channels, `confirmation:${a.id}:${appt.start.toISOString()}`);
      if (event === "booked_online" && s.stylist.newOnlineBooking.enabled) {
        const dep = appt.depositDue > 0 ? ` Deposit ${money(appt.depositDue)} due; the time is held ${s.depositHold.releaseAfterHours} hours.` : "";
        rows.push(stylistRow({ salon, staff: contactFor(b, a.staff_id), template: "stylistNewBooking", body: `New online booking: ${name}, ${appt.services.join(", ")}, ${when}.${dep}`, apptId: a.id, key: `new-booking:${a.id}`, sendAfter: now }));
      }
    }

    if (event === "cancelled" && s.client.cancel.enabled) {
      // Cancelled late at night? The notice waits for quiet hours to end.
      client("cancel", s.client.cancel.channels, `cancel:${a.id}`, afterQuiet(now, salon.timezone, s.quietHours));
    }

    if (event === "moved" && s.client.change.enabled) {
      client("change", s.client.change.channels, `change:${a.id}:${appt.start.toISOString()}`, afterQuiet(now, salon.timezone, s.quietHours));
    }

    // The client changed it themselves (client portal): let the stylist know.
    if (opts.byClient && (event === "cancelled" || event === "moved") && s.stylist.changeOrCancel.enabled) {
      const what = event === "cancelled" ? "cancelled" : "moved to";
      rows.push(stylistRow({ salon, staff: contactFor(b, a.staff_id), template: "stylistClientChange", body: `${name} ${what} ${event === "cancelled" ? `their ${when}` : when} appointment (${appt.services.join(", ")}).${opts.note ? ` ${opts.note}` : ""}`, apptId: a.id, key: `client-${event}:${a.id}:${appt.start.toISOString()}`, sendAfter: now }));
    }

    if (event === "checked_in" && s.stylist.checkIn.enabled) {
      rows.push(stylistRow({ salon, staff: contactFor(b, a.staff_id), template: "stylistCheckIn", body: `${name} is here for ${formatTime(appt.start, salon.timezone)}: ${appt.services.join(", ")}.`, apptId: a.id, key: `checkin:${a.id}`, sendAfter: now }));
    }

    if (event === "checked_out") {
      if (receipt && s.client.receipt.enabled) client("receipt", s.client.receipt.channels, `receipt:${a.id}`, now, receiptDetails(receipt));
      if (s.client.reviewRequest.enabled && s.client.reviewRequest.url) {
        const at = new Date(now.getTime() + s.client.reviewRequest.afterHours * 3_600_000);
        client("reviewRequest", s.client.reviewRequest.channels, `review:${a.id}`, afterQuiet(at, salon.timezone, s.quietHours));
      }
    }

    if (!rows.length) return;
    const { data: inserted, error: insErr } = await db.from("messages").upsert(rows, { onConflict: "business_id,dedupe_key,channel", ignoreDuplicates: true }).select("id");
    if (insErr) throw new Error(insErr.message);
    const ids = (inserted ?? []).map((r) => r.id as string);
    if (ids.length) await deliverQueued(db, configuredSender(), now, new Map([[salon.id, salon.name]]), ids);
  } catch (e) {
    console.error(`[messages] ${event} ${appointmentId}: ${(e as Error).message}`);
  }
}
