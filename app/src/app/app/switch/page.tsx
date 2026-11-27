import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { getContext } from "@/lib/context";
import { roleLabel } from "@/lib/auth/permissions";
import { membershipsOf } from "@/lib/setup/bootstrap";
import SwitchList from "./SwitchList";

export const metadata = { title: "Switch" };
export const dynamic = "force-dynamic";

/** Every salon (and your own business) you can work in. */
export default async function SwitchPage() {
  const ctx = await getContext();
  const mine = await membershipsOf(ctx.user.id);
  return (
    <>
      <AppNav current="/app/switch" businessName={ctx.business.name} />
      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold">Your salons</h1>
        <p className="text-sm text-muted">One sign-in for every place you work. Each keeps its own clients, calendar and money.</p>
        <SwitchList
          current={ctx.business.id}
          items={mine.map((m) => ({ id: m.businessId, name: m.name, detail: `${m.kind === "solo" ? "Your own business" : roleLabel(m.role)}${m.status === "pending" ? " · online booking not open yet" : ""}` }))}
        />
        <p className="text-sm text-muted">Work at another salon on Chairvana? <Link href="/app/join-salon" className="underline">Join a salon</Link> with their code, or ask them to add you.</p>
      </main>
    </>
  );
}
