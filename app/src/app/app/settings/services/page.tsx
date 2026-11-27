import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import ServicesEditor, { type EditorGroup, type EditorService, type EditorStylist } from "./ServicesEditor";

export const metadata = { title: "Services" };
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const ctx = await requirePermission("settings.services");
  const id = ctx.business.id;
  const [{ data: cats }, { data: svcs }, { data: staff }] = await Promise.all([
    ctx.supabase.from("service_categories").select("id,name,sort").eq("business_id", id).order("sort").order("name"),
    ctx.supabase
      .from("services")
      .select("id,category_id,name,description,price_type,price_cents,active_min,processing_min,finish_min,allow_booking_in_processing,deposit_category,stage,bookable_online,is_add_on,archived,price_needs_review,sort")
      .eq("business_id", id)
      .order("sort")
      .order("name"),
    ctx.supabase.from("staff").select("id,display_name,service_ids,sort").eq("business_id", id).eq("active", true).eq("bookable", true).order("sort"),
  ]);
  const groups: EditorGroup[] = (cats ?? []).map((c) => ({ id: c.id, name: c.name }));
  const services: EditorService[] = (svcs ?? []).map((s) => ({
    id: s.id,
    categoryId: s.category_id,
    name: s.name,
    description: s.description ?? "",
    priceType: s.price_type,
    priceCents: s.price_cents,
    active: s.active_min,
    processing: s.processing_min,
    finish: s.finish_min,
    bookDuringProcessing: s.allow_booking_in_processing,
    depositCategory: s.deposit_category,
    stage: s.stage,
    bookableOnline: s.bookable_online,
    isAddOn: s.is_add_on,
    archived: s.archived,
    needsReview: s.price_needs_review,
  }));
  const stylists: EditorStylist[] = (staff ?? []).map((s) => ({ id: s.id, name: s.display_name, serviceIds: (s.service_ids as string[] | null)?.length ? (s.service_ids as string[]) : null }));
  return (
    <>
      <AppNav current="/app/settings/services" businessName={ctx.business.name} />
      <ServicesEditor groups={groups} services={services} stylists={stylists} />
    </>
  );
}
