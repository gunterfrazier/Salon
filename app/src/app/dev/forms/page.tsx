import { notFound } from "next/navigation";
import FormFill from "@/app/f/[token]/FormFill";
import FormsSettings from "@/app/app/settings/forms/FormsSettings";
import ClientForms from "@/app/app/clients/[id]/ClientForms";
import { STARTER_FORMS } from "@/lib/forms/model";

/** Development-only previews of forms (404 in production). ?view=fill|settings|profile */
export const dynamic = "force-dynamic";

export default async function DevForms({ searchParams }: { searchParams: Promise<{ view?: string; form?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view = "fill", form = "color_consent" } = await searchParams;
  const s = STARTER_FORMS.find((f) => f.key === form) ?? STARTER_FORMS[0];
  if (view === "settings") {
    const t = STARTER_FORMS[2];
    return <FormsSettings templates={[{ id: "t1", key: t.key, name: t.name, intro: t.intro, fields: t.fields, needs_signature: t.needsSignature, ask: t.ask, renew_months: t.renewMonths, active: true, sort: 1 }]} starters={STARTER_FORMS.slice(0, 2).map((x) => ({ key: x.key, name: x.name, intro: x.intro }))} />;
  }
  if (view === "profile") {
    const c = STARTER_FORMS[1];
    return (
      <main className="mx-auto max-w-3xl p-4">
        <ClientForms
          clientId="c1"
          tz="America/Chicago"
          canEdit
          templates={[{ id: "t1", name: "Patch test & color consent" }]}
          forms={[
            { id: "f1", token: "x".repeat(64), title: "Patch test & color consent", status: "pending", createdAt: "2026-11-25T15:00:00Z", completedAt: null, fields: [], answers: null, signature: null },
            { id: "f2", token: "y".repeat(64), title: c.name, status: "completed", createdAt: "2026-11-20T15:00:00Z", completedAt: "2026-11-20T16:00:00Z", fields: c.fields, answers: { last_color: "6 weeks to 6 months ago", color_kind: ["Box / at-home color"], lightened: { yes: false }, chemical: { yes: false }, reaction: { yes: true, details: "Itchy scalp with box dye" }, goal: "Warm copper" }, signature: { name: "Jamie Rivers", path: "M 40 150 L 80 90 L 120 150 L 160 80 L 200 140 L 260 100 L 320 130" } },
          ]}
        />
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <p className="text-sm text-muted">Intensity Salon</p>
      <h1 className="text-2xl font-bold">{s.name}</h1>
      <FormFill token={"0".repeat(64)} firstName="Jamie" intro={s.intro} fields={s.fields} needsSignature={s.needsSignature} kiosk={false} />
    </main>
  );
}
