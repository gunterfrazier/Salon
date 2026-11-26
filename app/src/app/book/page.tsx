import { redirect } from "next/navigation";
import { loadPublicBusiness } from "@/lib/data/public-booking";

export const dynamic = "force-dynamic";

/**
 * Old booking link. With one salon it goes straight to that salon's booking
 * page (keeping ?services= and ?staff=); with several, to the salon finder.
 */
export default async function BookRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const b = await loadPublicBusiness();
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => (k === "services" || k === "staff") && v) as [string, string][]).toString();
  redirect(b ? `/s/${b.slug}/book${keep ? `?${keep}` : ""}` : "/find");
}
