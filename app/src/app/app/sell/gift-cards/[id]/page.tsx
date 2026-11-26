import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/context";
import { money } from "@/lib/format";
import PrintButton from "./PrintButton";

export const metadata = { title: "Gift card" };
export const dynamic = "force-dynamic";

/** A printable gift card. */
export default async function GiftCardPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePermission("sell");
  const { data: c } = await ctx.supabase.from("gift_cards").select("code,initial_cents,balance_cents,recipient_name,message,expires_on,status").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!c) notFound();
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <article className="rounded-2xl border-2 border-foreground p-6 text-center">
        <p className="text-sm uppercase tracking-widest text-muted">Gift card</p>
        <h1 className="mt-1 text-2xl font-bold">{ctx.business.name}</h1>
        {c.recipient_name && <p className="mt-4 text-lg">For {c.recipient_name}</p>}
        <p className="mt-3 text-4xl font-bold">{money(c.initial_cents)}</p>
        {c.message && <p className="mt-3 italic">“{c.message}”</p>}
        <p className="mt-5 text-sm text-muted">Code</p>
        <p className="font-mono text-3xl font-bold tracking-widest">{c.code.replace(/(.{4})/, "$1-")}</p>
        <p className="mt-4 text-xs text-muted">
          Show this code when you pay. Not redeemable for cash.
          {c.expires_on ? ` Use by ${new Date(`${c.expires_on}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" })}.` : ""}
        </p>
      </article>
      <p className="mt-3 text-center text-sm text-muted print:hidden">
        {c.status === "void" ? "This card was cancelled." : `Balance now: ${money(c.balance_cents)}`}
      </p>
      <div className="mt-3 flex justify-center print:hidden">
        <PrintButton />
      </div>
    </main>
  );
}
