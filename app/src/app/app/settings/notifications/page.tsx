import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { configuredSender } from "@/lib/notify/provider";
import { mergeNotificationSettings } from "@/lib/notify/settings";
import AlertContact from "./AlertContact";
import PushSetup from "./PushSetup";
import MessageLog, { type LogRow } from "./MessageLog";
import NotificationSettingsForm from "./NotificationSettingsForm";

export const metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const ctx = await requirePermission("settings.messages");
  const { data } = await ctx.supabase
    .from("messages")
    .select("id,created_at,sent_at,audience,channel,template,status,error,body,clients(first_name,last_name)")
    .eq("business_id", ctx.business.id)
    .order("created_at", { ascending: false })
    .limit(30);
  type Row = { id: string; created_at: string; sent_at: string | null; audience: string; channel: string; template: string; status: string; error: string | null; body: string; clients: { first_name: string; last_name: string | null } | null };
  const rows: LogRow[] = ((data ?? []) as unknown as Row[]).map((m) => ({
    id: m.id,
    createdAt: m.created_at,
    sentAt: m.sent_at,
    audience: m.audience,
    channel: m.channel,
    template: m.template,
    status: m.status,
    error: m.error,
    body: m.body,
    to: m.audience === "stylist" ? "you" : [m.clients?.first_name, m.clients?.last_name].filter(Boolean).join(" ") || "client",
  }));
  const { data: me } = await ctx.supabase.from("staff").select("phone,email").eq("id", ctx.staff.id).single();
  const { data: devices } = await ctx.supabase.from("push_subscriptions").select("endpoint,device,last_ok_at").eq("staff_id", ctx.staff.id);
  const sender = configuredSender();
  return (
    <>
      <AppNav current="/app/settings/notifications" businessName={ctx.business.name} />
      <NotificationSettingsForm
        initial={mergeNotificationSettings(ctx.business.notification_settings)}
        salon={ctx.business.name}
        timezone={ctx.business.timezone}
        connected={{ sms: !!sender.sms, email: !!sender.email }}
      />
      <PushSetup devices={(devices ?? []).map((d) => ({ endpoint: d.endpoint, device: d.device, lastOk: d.last_ok_at }))} />
      <div className="h-4" />
      <AlertContact phone={me?.phone ?? ""} email={me?.email ?? ""} />
      <div className="h-4" />
      <MessageLog rows={rows} timezone={ctx.business.timezone} />
    </>
  );
}
