import { notFound } from "next/navigation";
import OfferView from "@/app/o/[token]/OfferView";
import OutSickView from "@/app/app/out-sick/OutSickView";
import SickSettingsForm from "@/app/app/settings/policies/SickSettingsForm";
import { cleanSickSettings } from "@/lib/sick/rules";
import type { Choice } from "@/lib/sick/server";

/** Development-only preview of the sick-day screens with sample data (404 in production). ?v=offer|staff|settings */
export default async function DevSick({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const v = (await searchParams).v ?? "offer";
  const c = (option: Choice["option"], staffName: string, label: string, badge: string | null, total: number, was: number): Choice => ({ option, staffId: staffName, staffName, start: `2026-12-0${label.length % 9}T16:00:00Z${staffName}`, label, badge, total, was });
  if (v === "settings") return <SickSettingsForm initial={cleanSickSettings({ discounts: true })} />;
  if (v === "staff")
    return (
      <OutSickView
        me="k"
        today="2026-11-28"
        people={[{ id: "k", name: "Karissa Frazier" }, { id: "j", name: "Jordan Lee" }]}
        days={[{ id: "d", who: "Karissa Frazier", days: "Tuesday, Dec 1", reason: null, active: true, offers: [
          { id: "1", client: "Morgan Tate", phone: "2565551234", was: "Tue, Dec 1 10:00 AM", status: "rescheduled", outcome: "Moved to Tue, Dec 1 10:30 AM with Jordan · $5 off (someone else, same time)", link: "https://chairvana.app/o/x" },
          { id: "2", client: "Avery Cole", phone: null, was: "Tue, Dec 1 1:00 PM", status: "open", outcome: "Link sent, waiting for them", link: "https://chairvana.app/o/y" },
        ] }]}
      />
    );
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <p className="text-center text-sm text-muted">Intensity Salon</p>
      <h1 className="mt-1 text-center font-display text-3xl">Karissa is out sick</h1>
      <p className="mt-2 text-center text-muted">Hi Morgan, we&rsquo;re sorry! Karissa can&rsquo;t make your Women&rsquo;s Cut on Tuesday, December 1 at 10:00 AM. Pick a new time below.</p>
      <OfferView
        token="t"
        sickName="Karissa"
        settings={{ substitutes: true }}
        phone="2565551234"
        choices={{
          otherDaySame: [c("otherDaySame", "Karissa", "Thu, Dec 3 at 10:00 AM", "20% off", 2800, 3500), c("otherDaySame", "Karissa", "Fri, Dec 4 at 9:30 AM", "20% off", 2800, 3500)],
          sameWindowOther: [c("sameWindowOther", "Jordan", "Tue, Dec 1 at 10:30 AM", "$5 off", 3000, 3500)],
          sameDayOther: [c("sameDayOther", "Jordan", "Tue, Dec 1 at 2:15 PM", "$10 off", 2500, 3500)],
          otherDayOther: [c("otherDayOther", "Jordan", "Wed, Dec 2 at 11:00 AM", "10% off", 3150, 3500)],
        }}
      />
    </main>
  );
}
