import Link from "next/link";
import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import type { FormField } from "@/lib/forms/model";
import { pendingForms } from "@/lib/forms/server";
import { createAdminClient } from "@/lib/supabase/admin";
import FormFill from "./FormFill";

export const dynamic = "force-dynamic";
export const metadata = { title: "Form", robots: { index: false, follow: false } };

/** A client fills in and signs a form from the link the salon sent. */
export default async function FormPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ kiosk?: string }> }) {
  const { token } = await params;
  const { kiosk } = await searchParams;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const db = createAdminClient();
  const { data: f } = await db.from("client_forms").select("id,business_id,client_id,title,intro,fields,needs_signature,status,clients(first_name),businesses(name)").eq("token", token).maybeSingle();
  if (!f) notFound();
  const salon = (f.businesses as unknown as { name: string } | null)?.name ?? "Your salon";
  const first = (f.clients as unknown as { first_name: string } | null)?.first_name ?? "";
  const next = f.status === "completed" ? (await pendingForms(db, f.business_id, f.client_id)).find((x) => x.id !== f.id) : undefined;
  return (
    <>
      <main className="mx-auto max-w-lg px-4 py-8">
        <p className="text-sm text-muted">{salon}</p>
        <h1 className="text-2xl font-bold">{f.title}</h1>
        {f.status === "pending" ? (
          <FormFill token={token} firstName={first} intro={f.intro} fields={f.fields as FormField[]} needsSignature={f.needs_signature} kiosk={kiosk === "1"} />
        ) : (
          <section className="mt-4 rounded-2xl border border-line bg-surface p-5" role="status">
            <p className="font-semibold">{f.status === "completed" ? "This form is already filled in. Thank you!" : "This form is no longer needed."}</p>
            {next && <Link href={`/f/${next.token}${kiosk === "1" ? "?kiosk=1" : ""}`} className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent">Next: {next.title}</Link>}
          </section>
        )}
      </main>
      {kiosk !== "1" && <SiteFooter />}
    </>
  );
}
