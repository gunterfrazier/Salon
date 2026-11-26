import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import SalonProfileForm from "./SalonProfileForm";

export const metadata = { title: "Salon profile" };
export const dynamic = "force-dynamic";

export default async function SalonSettingsPage() {
  const ctx = await requirePermission("settings.salon");
  const { data: b } = await ctx.supabase.from("businesses").select("name,slug,street,city,state,zip,phone,about,listed,status,lat,lng").eq("id", ctx.business.id).single();
  return (
    <>
      <AppNav current="/settings/salon" businessName={ctx.business.name} />
      <SalonProfileForm
        initial={{ name: b?.name ?? "", slug: b?.slug ?? "", street: b?.street ?? "", city: b?.city ?? "", state: b?.state ?? "", zip: b?.zip ?? "", phone: b?.phone ?? "", about: b?.about ?? "", listed: b?.listed ?? true }}
        status={b?.status ?? "approved"}
        located={b?.lat != null}
      />
    </>
  );
}
