import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { offerLink } from "@/lib/sick/server";
import { SICK_OPTIONS } from "@/lib/sick/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, formatDay, formatTime, todayIn, wallParts } from "@/lib/time/zone";
import OutSickView, { type SickDayCard } from "./OutSickView";

export const metadata = { title: "Out sick" };
export const dynamic = "force-dynamic";

/** Mark yourself (or a teammate) out sick, and follow each affected client. */
export default async function OutSickPage() {
  const ctx = await getContext();
  const tz = ctx.business.timezone;
  const today = todayIn(tz);
  const others = ctx.can("team.manage") || ctx.can("calendar.all");
  const db = createAdminClient();
  const [{ data: team }, { data: days }] = await Promise.all([
    db.from("staff").select("id,display_name").eq("business_id", ctx.business.id).eq("active", true).is("suspended_at", null).eq("bookable", true).order("sort"),
    db
      .from("sick_days")
      .select("id,staff_id,starts_on,ends_on,reason,time_off_id,staff:staff!sick_days_staff_id_fkey(display_name),sick_offers(id,token,status,original_start,new_start,choice,discount_cents,sent_at,expires_at,clients(first_name,last_name,phone),new:staff!sick_offers_new_staff_id_fkey(display_name))")
      .eq("business_id", ctx.business.id)
      .gte("ends_on", addDays(today, -14))
      .order("starts_on", { ascending: false })
      .limit(20),
  ]);
  const at = (iso: string) => `${formatDay(wallParts(new Date(iso), tz).date, { weekday: "short", month: "short", day: "numeric" })} ${formatTime(new Date(iso), tz)}`;
  type Offer = { id: string; token: string; status: string; original_start: string; new_start: string | null; choice: string | null; discount_cents: number; sent_at: string | null; expires_at: string; clients: { first_name: string; last_name: string | null; phone: string | null } | null; new: { display_name: string } | null };
  type Day = { id: string; staff_id: string; starts_on: string; ends_on: string; reason: string | null; time_off_id: string | null; staff: { display_name: string } | null; sick_offers: Offer[] };
  const nowMs = new Date().getTime();
  const cards: SickDayCard[] = ((days ?? []) as unknown as Day[])
    .filter((d) => others || d.staff_id === ctx.staff.id)
    .map((d) => ({
      id: d.id,
      who: d.staff?.display_name ?? "Stylist",
      days: d.starts_on === d.ends_on ? formatDay(d.starts_on, { weekday: "long", month: "short", day: "numeric" }) : `${formatDay(d.starts_on, { month: "short", day: "numeric" })} – ${formatDay(d.ends_on, { month: "short", day: "numeric" })}`,
      reason: d.reason,
      active: !!d.time_off_id,
      offers: [...d.sick_offers]
        .sort((x, y) => x.original_start.localeCompare(y.original_start))
        .map((o) => {
          const expired = o.status === "open" && Date.parse(o.expires_at) <= nowMs;
          const status = expired ? "expired" : o.status;
          return {
            id: o.id,
            client: [o.clients?.first_name, o.clients?.last_name].filter(Boolean).join(" ") || "Client",
            phone: o.clients?.phone ?? null,
            was: at(o.original_start),
            status,
            outcome:
              status === "rescheduled" && o.new_start
                ? `Moved to ${at(o.new_start)}${o.new ? ` with ${o.new.display_name.split(" ")[0]}` : ""}${o.discount_cents ? ` · $${(o.discount_cents / 100).toFixed(o.discount_cents % 100 ? 2 : 0)} off (${SICK_OPTIONS.find((x) => x.key === o.choice)?.label.toLowerCase() ?? "discount"})` : ""}`
                : status === "cancelled"
                  ? "Cancelled (no fee). Refund their deposit if they paid one."
                  : status === "handled"
                    ? "Handled by the salon"
                    : status === "expired"
                      ? "Link closed without an answer: still on the calendar"
                      : o.sent_at
                        ? "Link sent, waiting for them"
                        : "Link not sent yet",
            link: offerLink(o.token),
          };
        }),
    }));
  return (
    <>
      <AppNav current="/app/out-sick" businessName={ctx.business.name} />
      <OutSickView
        me={ctx.staff.id}
        today={today}
        people={(team ?? []).filter((t) => others || t.id === ctx.staff.id).map((t) => ({ id: t.id as string, name: t.display_name as string }))}
        days={cards}
      />
    </>
  );
}
