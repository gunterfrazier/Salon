import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { mergeNotificationSettings } from "@/lib/notify/settings";
import NotificationSettingsForm from "./NotificationSettingsForm";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const ctx = await getContext();
  return (
    <>
      <AppNav current="/settings/notifications" businessName={ctx.business.name} />
      <NotificationSettingsForm initial={mergeNotificationSettings(ctx.business.notification_settings)} salon={ctx.business.name} timezone={ctx.business.timezone} smsConnected={false} />
    </>
  );
}
