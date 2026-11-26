import { notFound } from "next/navigation";
import PayView from "@/app/app/pay/PayView";
import { computePay, type PayPlan } from "@/lib/pay/compute";

/** Development-only preview of Pay (404 in production). */
export const dynamic = "force-dynamic";

export default function DevPay() {
  if (process.env.NODE_ENV === "production") notFound();
  const plans: PayPlan[] = [
    { staffId: "k", name: "Karissa Frazier", payType: "none", servicePct: 0, retailPct: 0, rentCents: 0, rentPeriod: "week", collectsOwn: true },
    { staffId: "j", name: "Jordan Lee", payType: "commission", servicePct: 40, retailPct: 10, rentCents: 0, rentPeriod: "week", collectsOwn: true },
    { staffId: "b", name: "Bree Adams", payType: "booth_rent", servicePct: 0, retailPct: 0, rentCents: 20000, rentPeriod: "week", collectsOwn: true },
  ];
  const lines = computePay({ plans, from: "2026-11-22", to: "2026-11-28", services: [{ staffId: "k", cents: 61000 }, { staffId: "j", cents: 25000 }, { staffId: "j", cents: 12000 }, { staffId: "b", cents: 30000 }], retail: [{ staffId: "j", cents: 4400 }], tips: [{ staffId: "j", cents: 6000 }, { staffId: "k", cents: 9000 }], rentPaid: [{ staffId: "b", cents: 10000 }] });
  return <PayView data={{ lines, plans, rent: [{ id: "r1", staffId: "b", cents: 10000, method: "cash", paidOn: "2026-11-23", note: null }] }} range={{ key: "week", from: "2026-11-22", to: "2026-11-28" }} today="2026-11-26" manage methods={[{ key: "cash", label: "Cash" }]} />;
}
