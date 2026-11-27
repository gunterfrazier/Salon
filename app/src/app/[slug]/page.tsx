import { notFound, redirect } from "next/navigation";
import { shortSlug } from "@/lib/short-links";
import { createAdminClient } from "@/lib/supabase/admin";

/** chairvana.app/intensity-salon → chairvana.app/s/intensity-salon */
export const dynamic = "force-dynamic";

export default async function ShortLink({ params }: { params: Promise<{ slug: string }> }) {
  const slug = shortSlug(`/${(await params).slug}`);
  if (!slug) notFound();
  let found: string | null = null;
  try {
    const { data } = await createAdminClient().from("businesses").select("slug").eq("slug", slug).eq("status", "approved").maybeSingle();
    found = data?.slug ?? null;
  } catch {
    found = null;
  }
  if (!found) notFound();
  redirect(`/s/${found}`);
}
