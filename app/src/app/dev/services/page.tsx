import { notFound } from "next/navigation";
import ServicesEditor, { type EditorService } from "@/app/app/settings/services/ServicesEditor";
import menuJson from "../../../../seed/service-menu.json";

/** Development-only preview of Settings → Services with the starting menu (404 in production). */
export default function DevServices() {
  if (process.env.NODE_ENV === "production") notFound();
  type Raw = { key: string; name: string; priceType: EditorService["priceType"]; price: number; active: number; processing: number; finish: number; depositCategory: "standard" | "color"; stage: string; bookableOnline?: boolean; isAddOn?: boolean; description?: string };
  const cats = menuJson.categories as unknown as { key: string; name: string; services: Raw[] }[];
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  let n = 100;
  const groups = cats.map((c, i) => ({ id: id(i + 1), name: c.name }));
  const services: EditorService[] = cats.flatMap((c, i) =>
    c.services.map((s) => {
      const k = n++;
      return {
        id: id(k), categoryId: id(i + 1), name: s.name, description: s.description ?? "", priceType: s.priceType, priceCents: Math.round(s.price * 100),
        active: s.active, processing: s.processing, finish: s.finish, bookDuringProcessing: true, depositCategory: s.depositCategory, stage: s.stage,
        bookableOnline: s.bookableOnline !== false, isAddOn: !!s.isAddOn, archived: k === 104, needsReview: k < 102,
      };
    }),
  );
  const stylists = [
    { id: id(900), name: "Karissa Frazier", serviceIds: null },
    { id: id(901), name: "Jordan Lee", serviceIds: [id(100), id(101), id(102)] },
  ];
  return <ServicesEditor groups={groups} services={services} stylists={stylists} />;
}
