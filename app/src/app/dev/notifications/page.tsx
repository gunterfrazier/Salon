import { notFound } from "next/navigation";
import NotificationSettingsForm from "@/app/settings/notifications/NotificationSettingsForm";
import { DEFAULT_NOTIFICATIONS } from "@/lib/notify/settings";

/** Development-only preview of Settings › Messages (404 in production). */
export const dynamic = "force-dynamic";

export default function DevNotifications() {
  if (process.env.NODE_ENV === "production") notFound();
  return <NotificationSettingsForm initial={DEFAULT_NOTIFICATIONS} salon="Intensity Salon" timezone="America/Chicago" smsConnected={false} />;
}
