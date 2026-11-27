import { notFound } from "next/navigation";
import MarketingView from "@/app/app/marketing/MarketingView";
import PrintSheet from "@/app/app/marketing/print/PrintSheet";
import RateVisit from "@/app/r/[token]/RateVisit";

/** Development-only previews (404 in production). ?view=kit|cling|counter|cards|rate */
export const dynamic = "force-dynamic";

export default async function DevMarketing({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view = "kit" } = await searchParams;
  const base = { salon: "Intensity Salon", bookUrl: "https://chairvana.app/s/intensity-salon/book", pageUrl: "https://chairvana.app/s/intensity-salon", reviewUrl: "https://g.page/r/example/review", phone: "(256) 555-0100", handle: "@intensitysalon" };
  if (view === "cling" || view === "counter" || view === "cards") return <PrintSheet kind={view} {...base} />;
  if (view === "rate")
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-muted">Intensity Salon</p>
        <h1 className="mt-1 font-display text-4xl">How was your visit?</h1>
        <p className="mt-2 text-muted">All Over Color, Style with Karissa</p>
        <RateVisit token={"0".repeat(64)} salonSlug="intensity-salon" stylist="Karissa" />
      </main>
    );
  return <MarketingView salon={base.salon} pageUrl={base.pageUrl} bookUrl={base.bookUrl} googleReview={base.reviewUrl} social={{ instagram: "https://instagram.com/intensitysalon" }} />;
}
