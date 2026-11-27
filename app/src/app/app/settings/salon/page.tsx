import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import SalonProfileForm from "./SalonProfileForm";
import BrandingForm from "./BrandingForm";
import { branding } from "@/lib/branding";
import { mediaUrl } from "@/lib/media";

export const metadata = { title: "Salon profile" };
export const dynamic = "force-dynamic";

export default async function SalonSettingsPage() {
  const ctx = await requirePermission("settings.salon");
  const [{ data: b }, { data: photos }, { data: staff }] = await Promise.all([
    ctx.supabase.from("businesses").select("name,slug,street,city,state,zip,phone,about,listed,status,lat,lng,branding").eq("id", ctx.business.id).single(),
    ctx.supabase.from("salon_photos").select("id,path,caption,staff(display_name)").eq("business_id", ctx.business.id).order("sort").order("created_at", { ascending: false }).limit(60),
    ctx.supabase.from("staff").select("id,display_name").eq("business_id", ctx.business.id).eq("active", true).eq("bookable", true).order("sort"),
  ]);
  const look = branding(b?.branding);
  return (
    <>
      <AppNav current="/app/settings/salon" businessName={ctx.business.name} />
      <SalonProfileForm
        initial={{ name: b?.name ?? "", slug: b?.slug ?? "", street: b?.street ?? "", city: b?.city ?? "", state: b?.state ?? "", zip: b?.zip ?? "", phone: b?.phone ?? "", about: b?.about ?? "", listed: b?.listed ?? true }}
        status={b?.status ?? "approved"}
        located={b?.lat != null}
      />
      <BrandingForm
        name={b?.name ?? ctx.business.name}
        accent={look.accent}
        logoUrl={mediaUrl(look.logoPath)}
        coverUrl={mediaUrl(look.coverPath)}
        photos={(photos ?? []).map((p) => ({ id: p.id, url: mediaUrl(p.path)!, caption: p.caption, staff: (p.staff as unknown as { display_name: string } | null)?.display_name ?? null }))}
        stylists={(staff ?? []).map((x) => ({ id: x.id, name: x.display_name }))}
      />
    </>
  );
}
