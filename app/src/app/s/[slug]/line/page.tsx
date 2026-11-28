import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { accentStyle, branding } from "@/lib/branding";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanWalkinSettings } from "@/lib/walkins/engine";
import { lineBusinessBySlug, loadLine } from "@/lib/walkins/server";
import JoinLine from "./JoinLine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Walk-in wait" };

/** A salon's walk-in line: current waits, and (if allowed) join it. */
export default async function LinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAdminClient();
  const b = await lineBusinessBySlug(db, slug);
  if (!b) notFound();
  const s = cleanWalkinSettings(b.walkin_settings);
  if (s.mode === "off") notFound();
  const line = await loadLine(db, b);
  const { data: svcs } = await db.from("services").select("id,name,sort,is_add_on,bookable_online").eq("business_id", b.id).eq("archived", false).eq("bookable_online", true).order("sort");
  return (
    <div style={accentStyle(branding(b.branding))}>
      <main className="mx-auto max-w-lg space-y-5 px-4 py-8">
        <div className="text-center">
          <p className="text-sm text-muted">{b.name}</p>
          <h1 className="mt-1 font-display text-4xl">Walk-in wait</h1>
          <p className="mt-2 text-muted">{line.waiting.length ? `${line.waiting.length} ${line.waiting.length === 1 ? "person" : "people"} in line.` : "No one in line right now."} Waits are estimates.</p>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          <li className="rounded-xl border border-accent bg-accent/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Anyone</p>
            <p className="text-lg font-semibold">{line.anyone.wait}</p>
          </li>
          {line.stylists.map((x) => (
            <li key={x.id} className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{x.name.split(" ")[0]}</p>
              <p className="text-lg font-semibold">{x.wait}</p>
            </li>
          ))}
        </ul>
        {s.joinOnline ? (
          <JoinLine slug={b.slug} services={(svcs ?? []).filter((x) => !x.is_add_on).map((x) => ({ id: x.id as string, name: x.name as string }))} stylists={line.stylists.map((x) => ({ id: x.id, name: x.name.split(" ")[0], wait: x.wait }))} />
        ) : (
          <p className="rounded-xl border border-line bg-surface p-4 text-center">Come on in: no appointment needed.{b.phone ? <> Questions? <a className="underline" href={`tel:${b.phone}`}>Call the salon</a>.</> : null}</p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
