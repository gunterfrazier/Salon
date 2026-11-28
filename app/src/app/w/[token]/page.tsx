import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { accentStyle, branding } from "@/lib/branding";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadLine, walkinByToken } from "@/lib/walkins/server";
import Status from "./Status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your place in line", robots: { index: false, follow: false } };

/** A walk-in's own page: place in line, likely stylist, wait; leave the line. */
export default async function WalkinStatus({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const found = await walkinByToken(db, token);
  if (!found) notFound();
  const { w, b } = found;
  let place: number | null = null;
  let wait = "";
  let with_: string | null = null;
  if (w.status === "waiting") {
    const line = await loadLine(db, b);
    const i = line.waiting.findIndex((x) => x.id === w.id);
    if (i >= 0) {
      place = i + 1;
      wait = line.waiting[i].wait;
      with_ = line.waiting[i].requestedName ?? line.waiting[i].staffName;
    }
  }
  return (
    <div style={accentStyle(branding(b.branding))}>
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-muted">{b.name}</p>
        <Status token={token} name={(w.name as string).split(" ")[0]} status={w.status as string} place={place} wait={wait} withName={with_} phone={b.phone} />
      </main>
      <SiteFooter />
    </div>
  );
}
