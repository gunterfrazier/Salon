import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { money } from "@/lib/format";
import { formatDateTime } from "@/lib/time/zone";
import PrintButton from "./PrintButton";

export const metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { cash: "Cash", venmo_direct: "Venmo", cash_app_direct: "Cash App", zelle: "Zelle", paypal_me: "PayPal", apple_cash: "Apple Cash", gift_card: "Gift card", other: "Other", card: "Card" };
const UUID = /^[0-9a-f-]{36}$/;

/** Printable receipt for a visit (?appointment=) or a quick sale (?sale=). Sized for 80 mm receipt paper. */
export default async function ReceiptPage({ searchParams }: { searchParams: Promise<{ appointment?: string; sale?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const tz = ctx.business.timezone;
  const db = ctx.supabase;
  const lines: { name: string; cents: number }[] = [];
  let when: Date;
  let client: string | null = null;
  let pays: { kind: string; method: string; amount_cents: number; status: string }[] = [];

  if (sp.appointment && UUID.test(sp.appointment)) {
    const { data: a } = await db
      .from("appointments")
      .select("id,start_at,status,clients(first_name,last_name),appointment_services(sort,price_quoted_cents,services(name))")
      .eq("business_id", ctx.business.id)
      .eq("id", sp.appointment)
      .maybeSingle();
    if (!a) notFound();
    when = new Date(a.start_at);
    const c = a.clients as unknown as { first_name: string; last_name: string | null } | null;
    client = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : null;
    for (const l of [...((a.appointment_services as unknown as { sort: number; price_quoted_cents: number; services: { name: string } | null }[]) ?? [])].sort((x, y) => x.sort - y.sort)) {
      lines.push({ name: l.services?.name ?? "Service", cents: l.price_quoted_cents });
    }
    const [{ data: items }, { data: p }] = await Promise.all([
      db.from("sale_items").select("name,qty,price_cents").eq("appointment_id", a.id),
      db.from("payments").select("kind,method,amount_cents,status").eq("appointment_id", a.id),
    ]);
    for (const it of items ?? []) lines.push({ name: `${Number(it.qty) === 1 ? "" : `${Number(it.qty)} × `}${it.name}`, cents: Math.round(Number(it.qty) * it.price_cents) });
    pays = p ?? [];
  } else if (sp.sale && UUID.test(sp.sale)) {
    const { data: items } = await db.from("sale_items").select("name,qty,price_cents,created_at,clients(first_name,last_name)").eq("business_id", ctx.business.id).eq("sale_id", sp.sale);
    if (!items?.length) notFound();
    when = new Date(items[0].created_at);
    const c = items[0].clients as unknown as { first_name: string; last_name: string | null } | null;
    client = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : null;
    for (const it of items) lines.push({ name: `${Number(it.qty) === 1 ? "" : `${Number(it.qty)} × `}${it.name}`, cents: Math.round(Number(it.qty) * it.price_cents) });
    const { data: p } = await db.from("payments").select("kind,method,amount_cents,status").eq("business_id", ctx.business.id).eq("note", `sale:${sp.sale}`);
    pays = p ?? [];
  } else {
    notFound();
  }

  const ok = pays.filter((p) => p.status === "succeeded");
  const tip = ok.filter((p) => p.kind === "tip").reduce((n, p) => n + p.amount_cents, 0);
  const deposit = ok.filter((p) => p.kind === "deposit").reduce((n, p) => n + p.amount_cents, 0);
  const subtotal = lines.reduce((n, l) => n + l.cents, 0);
  const total = subtotal + tip;
  const today = ok.filter((p) => !["deposit", "refund"].includes(p.kind));
  const byMethod = new Map<string, number>();
  for (const p of today) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount_cents);
  const paid = deposit + today.reduce((n, p) => n + p.amount_cents, 0);
  const owed = Math.max(0, total - paid);

  return (
    <main className="receipt mx-auto max-w-[80mm] bg-white p-4 font-mono text-[13px] leading-snug text-black">
      <style>{`@media print { @page { size: 80mm auto; margin: 4mm; } body { background: #fff; } .no-print { display: none; } } .receipt td { padding: 1px 0; vertical-align: top; }`}</style>
      <h1 className="text-center text-base font-bold">{ctx.business.name}</h1>
      <p className="text-center">{formatDateTime(when, tz)}</p>
      {client && <p className="mt-1 text-center">{client}</p>}
      <hr className="my-2 border-dashed border-black" />
      <table className="w-full">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.name}</td>
              <td className="pl-2 text-right whitespace-nowrap">{money(l.cents)}</td>
            </tr>
          ))}
          {tip > 0 && (
            <tr>
              <td>Tip</td>
              <td className="text-right">{money(tip)}</td>
            </tr>
          )}
          <tr className="font-bold">
            <td className="pt-1">Total</td>
            <td className="pt-1 text-right">{money(total)}</td>
          </tr>
          {deposit > 0 && (
            <tr>
              <td>Deposit paid earlier</td>
              <td className="text-right">−{money(deposit)}</td>
            </tr>
          )}
          {[...byMethod.entries()].map(([m, c]) => (
            <tr key={m}>
              <td>Paid ({METHOD[m] ?? m})</td>
              <td className="text-right">−{money(c)}</td>
            </tr>
          ))}
          {owed > 0 && (
            <tr className="font-bold">
              <td>Balance due</td>
              <td className="text-right">{money(owed)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <p className="text-center">Thank you!</p>
      <div className="no-print mt-4 flex justify-center gap-2 font-sans">
        <PrintButton />
      </div>
    </main>
  );
}
