import { notFound } from "next/navigation";
import WaitlistView from "@/app/app/waitlist/WaitlistView";
import type { WaitlistItem } from "@/lib/data/waitlist";

/** Development-only preview of the Waitlist page with sample entries (404 in production). */
export const dynamic = "force-dynamic";

const base: WaitlistItem = { id: "w1", clientId: "c1", clientName: "Jamie Rivers", phone: "256-555-0100", staffId: "s1", staffName: "Karissa", serviceIds: ["a"], serviceNames: ["All Over Color", "Women's Cut"], weekdays: [5, 6], timeFrom: 0, timeTo: 720, dateFrom: "2026-12-01", dateTo: "2026-12-31", note: "Wants to come in before Christmas", source: "online", status: "active", offers: 2, lastOfferedAt: "2026-11-25T15:00:00Z", createdAt: "2026-11-20T15:00:00Z", closedAt: null };

export default function DevWaitlist() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <WaitlistView
      items={[
        base,
        { ...base, id: "w2", clientName: "Morgan Lee", staffId: null, staffName: null, serviceNames: ["Blowout"], weekdays: [], timeFrom: 1020, timeTo: 1440, note: null, source: "staff", offers: 0, lastOfferedAt: null },
        { ...base, id: "w3", clientName: "Taylor Brooks", status: "booked", closedAt: "2026-11-24T15:00:00Z", note: null },
      ]}
      services={[{ id: "a", name: "All Over Color", category: "Color" }, { id: "b", name: "Women's Cut", category: "Cuts" }, { id: "c", name: "Blowout", category: "Style" }]}
      stylists={[{ id: "s1", name: "Karissa" }, { id: "s2", name: "Gunter" }]}
      clients={[{ id: "c1", name: "Jamie Rivers", phone: "256-555-0100" }]}
      today="2026-11-26"
      initialClient="c1"
    />
  );
}
