import { notFound } from "next/navigation";
import ScheduleSettings from "@/app/app/settings/schedule/ScheduleSettings";
import { mergeHolidays } from "@/lib/schedule/holidays";

/** Development-only preview of Settings › Schedule (404 in production). */
export default function DevSchedule() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <ScheduleSettings
      businessName="Intensity Salon"
      timezone="America/Chicago"
      today="2026-11-26"
      holidays={mergeHolidays({ rules: [{ key: "custom_x", name: "Salon anniversary", date: { type: "fixed", month: 3, day: 14 }, closed: true, custom: true }] })}
      daysOff={[
        { id: "t1", start: "2026-12-04T15:00:00.000Z", end: "2026-12-04T17:00:00.000Z", reason: "Dentist", allDay: false },
        { id: "t2", start: "2026-12-24T06:00:00.000Z", end: "2026-12-27T06:00:00.000Z", reason: "Christmas break", allDay: true },
      ]}
    />
  );
}
