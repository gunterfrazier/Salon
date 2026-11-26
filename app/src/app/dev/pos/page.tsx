import { notFound } from "next/navigation";
import Kiosk from "@/app/app/kiosk/Kiosk";
import SellView from "@/app/app/sell/SellView";

/** Development-only previews of the kiosk and Sell screens (404 in production). */
export const dynamic = "force-dynamic";

export default async function DevPos({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  if ((await searchParams).view === "kiosk") return <Kiosk salon="Intensity Salon" />;
  return (
    <SellView
        templates={[{ id: "t1", name: "5 blowouts", serviceName: "Blowout", visits: 5, priceCents: 14000, expireMonths: 12 }]}
      products={[
        { id: "00000000-0000-0000-0000-000000000001", label: "Redken Acidic Bonding Concentrate Shampoo 10oz", priceCents: 2800, onHand: 4, barcode: "884486453", retail: true },
        { id: "00000000-0000-0000-0000-000000000002", label: "Kenra Volume Spray 25 10oz", priceCents: 2200, onHand: 6, barcode: null, retail: true },
      ]}
      clients={[{ id: "c1", name: "Jamie Rivers", phone: "(256) 555-0101" }]}
      methods={[{ key: "cash", label: "Cash" }, { key: "venmo_direct", label: "Venmo" }]}
    />
  );
}
