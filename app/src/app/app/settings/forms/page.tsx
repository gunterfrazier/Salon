import { AppNav } from "@/components/AppNav";
import { requirePermission } from "@/lib/context";
import { STARTER_FORMS } from "@/lib/forms/model";
import { TEMPLATE_COLS, type TemplateRow } from "@/lib/forms/server";
import FormsSettings from "./FormsSettings";

export const metadata = { title: "Forms" };
export const dynamic = "force-dynamic";

export default async function FormsSettingsPage() {
  const ctx = await requirePermission("settings.messages");
  const { data } = await ctx.supabase.from("form_templates").select(TEMPLATE_COLS).eq("business_id", ctx.business.id).order("sort");
  const templates = (data ?? []) as TemplateRow[];
  const used = new Set(templates.map((t) => t.key));
  return (
    <>
      <AppNav current="/app/settings/forms" businessName={ctx.business.name} />
      <FormsSettings templates={templates} starters={STARTER_FORMS.filter((s) => !used.has(s.key)).map((s) => ({ key: s.key, name: s.name, intro: s.intro }))} />
    </>
  );
}
