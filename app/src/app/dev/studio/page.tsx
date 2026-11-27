import { notFound } from "next/navigation";
import StudioView from "@/app/app/marketing/studio/StudioView";

/** Development-only preview of the graphics studio (404 in production). */
export const dynamic = "force-dynamic";

export default function DevStudio() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <StudioView
      salon="Intensity Salon"
      bookUrl="https://chairvana.app/s/intensity-salon/book"
      accent="#b9dcf2"
      logoUrl={null}
      photos={[{ url: "/brand/og.png", caption: "Sample" }]}
      specials={[{ code: "HOLIDAY15", text: "15% off any color service", until: "December 31" }]}
      reviews={[{ text: "Karissa is amazing! My color has never looked better and she really listened to what I wanted.", name: "Morgan T." }]}
      openings={["Tue, Dec 1 · 2:00 PM", "Wed, Dec 2 · 10:30 AM", "Fri, Dec 4 · 1:00 PM"]}
      wrapped={{ year: 2026, visits: 812, clients: 263, newClients: 74, hours: 1240, topService: "Women's Cut", busiestMonth: "December", fiveStar: 41, regulars: 118 }}
    />
  );
}
