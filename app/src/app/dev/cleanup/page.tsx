import { notFound } from "next/navigation";
import CleanupView from "@/app/app/settings/cleanup/CleanupView";

/** Development-only preview of the test-data cleanup screen (404 in production). */
export const dynamic = "force-dynamic";

export default function DevCleanup() {
  if (process.env.NODE_ENV === "production") notFound();
  const c = (id: string, name: string, contact: string, booked: number, done: number, paid: number, email: string | null = null) => ({ id, name, contact, email, source: "manual", created: "2026-11-20T15:00:00Z", booked, done, paid });
  return (
    <CleanupView
      tz="America/Chicago"
      clients={[
        c("1", "Test Client", "(256) 555-0101", 3, 1, 5500),
        c("2", "Morgan Tate", "(256) 555-2201", 12, 11, 66000),
        c("3", "Demo Booking", "demo@example.com", 1, 0, 0, "demo@example.com"),
        c("4", "Jamie Rivers", "(256) 555-3302", 4, 4, 20500),
      ]}
    />
  );
}
