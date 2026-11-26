import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { MANUAL_METHODS } from "@/lib/data/calendar";
import { loadPay, payRange } from "@/lib/data/pay";
import { todayIn } from "@/lib/time/zone";
import PayView from "./PayView";

export const metadata = { title: "Pay" };
export const dynamic = "force-dynamic";

/** Commission, tips and booth rent. The owner (Team permission) sees everyone; others see their own. */
export default async function PayPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const today = todayIn(ctx.business.timezone);
  const r = payRange(sp, today);
  const all = ctx.can("team.manage");
  const data = await loadPay(ctx.supabase, ctx.business.id, ctx.business.timezone, r.from, r.to, all ? undefined : ctx.staff.id);
  return (
    <>
      <AppNav current="/app/pay" businessName={ctx.business.name} />
      <PayView data={data} range={r} today={today} manage={all} methods={MANUAL_METHODS} />
    </>
  );
}
