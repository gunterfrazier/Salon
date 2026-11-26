import { notFound } from "next/navigation";
import MeView from "@/app/app/me/MeView";

/** Development-only preview of the client portal (404 in production). */
export const dynamic = "force-dynamic";

export default function DevMe() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <MeView
      me={{
        id: "cu1", email: "jamie@example.com", firstName: "Jamie", lastName: "Rivers", phone: "(256) 555-0101", smsOptIn: true,
        homeZip: "36280", hasHome: true, searchMiles: 25,
        preferredSalon: { id: "b1", slug: "intensity-salon", name: "Intensity Salon", stylists: [{ id: "st1", name: "Karissa Frazier", title: "Color specialist" }, { id: "st2", name: "Sam Lee", title: null }] },
        preferredStylistId: "st1",
        salons: [{ id: "b1", slug: "intensity-salon", name: "Intensity Salon" }, { id: "b2", slug: "glow-studio", name: "Glow Studio" }],
      }}
      salons={[{
        salon: { id: "b1", slug: "intensity-salon", name: "Intensity Salon", timezone: "America/Chicago", phone: "(256) 555-0100" },
        client: { id: "c1", firstName: "Jamie", lastName: "Rivers", phone: "(256) 555-0101", email: "jamie@example.com", smsOptIn: true, favorites: null },
        upcoming: [
          { id: "a1", start: "2026-12-08T16:30:00Z", end: "2026-12-08T19:00:00Z", status: "pending", services: [{ serviceId: "s1", name: "Full Highlights", cents: 15000 }, { serviceId: "s2", name: "Women's Cut", cents: 5500 }], total: 20500, depositRequired: 5000, depositPaid: 0, payWith: "https://venmo.com/IntensitySalon?txn=pay&amount=50.00", canChange: true, lateCancel: false },
          { id: "a2", start: "2026-11-27T15:00:00Z", end: "2026-11-27T16:00:00Z", status: "booked", services: [{ serviceId: "s2", name: "Women's Cut", cents: 5500 }], total: 5500, depositRequired: 0, depositPaid: 0, payWith: null, canChange: false, lateCancel: true },
        ],
        past: [{ id: "p1", start: "2026-10-20T15:00:00Z", status: "completed", services: ["All Over Color", "Style"], serviceIds: ["s3", "s4"], total: 12350 }],
        balance: 0,
        balancePayWith: null,
        policy: { lateCancelWindowHours: 24, lateCancelCharge: "full" },
      }, {
        salon: { id: "b2", slug: "glow-studio", name: "Glow Studio", timezone: "America/Chicago", phone: null },
        client: { id: "c2", firstName: "Jamie", lastName: "Rivers", phone: "(256) 555-0101", email: "jamie@example.com", smsOptIn: true, favorites: null },
        upcoming: [],
        past: [{ id: "p2", start: "2026-09-02T15:00:00Z", status: "completed", services: ["Brow Wax"], serviceIds: ["g1"], total: 1500 }],
        balance: 2500,
        balancePayWith: "Zelle (256) 555-0199",
        policy: { lateCancelWindowHours: 48, lateCancelCharge: "full" },
      }]}
    />
  );
}
