import { notFound } from "next/navigation";
import { TabBar } from "@/components/TabBar";

/** Development-only preview of the phone tab bar (404 in production). */
export const dynamic = "force-dynamic";

export default function DevTabs() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main className="p-4">
        <h1 className="text-2xl font-bold">Today</h1>
        <p className="text-muted">Phone tab bar preview.</p>
      </main>
      <TabBar
        current="/app/today"
        tabs={[
          { href: "/app/today", label: "Today", icon: "today" },
          { href: "/app/calendar", label: "Calendar", icon: "calendar" },
          { href: "/app/clients", label: "Clients", icon: "clients" },
          { href: "/app/sell", label: "Sell", icon: "sell" },
        ]}
        more={[{ href: "/app/waitlist", label: "Waitlist" }, { href: "/app/inventory", label: "Inventory" }, { href: "/app/reports", label: "Reports" }, { href: "/app/pay", label: "Pay" }, { href: "/app/account", label: "Account" }]}
      />
    </>
  );
}
