import { notFound } from "next/navigation";
import WalkinsView from "@/app/app/walkins/WalkinsView";
import ScreenPlayer from "@/components/screens/ScreenPlayer";
import { cleanWalkinSettings } from "@/lib/walkins/engine";

/** Development-only preview of the walk-ins desk and TV slide (404 in production). ?v=desk|setup|tv */
export default async function DevWalkins({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const v = (await searchParams).v ?? "desk";
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";
  const team = [{ id: A, name: "Karissa Frazier", commission: false }, { id: B, name: "Jordan Lee", commission: true }];
  if (v === "tv") {
    return (
      <ScreenPlayer
        name="Waiting area"
        slides={[{ id: "w", type: "walkins", seconds: 15 }]}
        settings={{ touch: false, header: true }}
        data={{ salon: { name: "Intensity Salon", logoUrl: null, accent: null, bookUrl: "", shortUrl: "chairvana.app/intensity-salon", tz: "America/Chicago", today: "2026-12-01" }, stylists: [], walkins: { on: true, anyone: "about 10–20 min", stylists: [{ name: "Karissa", wait: "about 25–35 min" }, { name: "Jordan", wait: "about 10–20 min" }], inLine: 3, joinUrl: "https://chairvana.app/s/intensity-salon/line" } }}
      />
    );
  }
  const now = Date.UTC(2026, 11, 1, 16, 0);
  const settings = cleanWalkinSettings({ mode: "both", joinOnline: true, method: "rotation", order: [A, B], turns: "half_quick" });
  return (
    <WalkinsView
      canSetUp
      team={team}
      menu={[{ id: "1", name: "Women's Cut" }, { id: "2", name: "Men's Cut" }, { id: "3", name: "Bang Trim" }]}
      view={{
        settings: v === "setup" ? settings : settings,
        now,
        waiting: [
          { id: "w1", name: "Riley Park", phone: null, services: ["Men's Cut"], serviceIds: ["2"], requestedId: null, requestedName: null, source: "kiosk", joinedAt: "", minutes: 20, token: "t", staffId: B, staffName: "Jordan", start: now + 12 * 60_000, wait: "about 10–20 min" },
          { id: "w2", name: "Sam Ortiz", phone: null, services: [], serviceIds: [], requestedId: A, requestedName: "Karissa", source: "online", joinedAt: "", minutes: 30, token: "t", staffId: A, staffName: "Karissa", start: now + 28 * 60_000, wait: "about 25–35 min" },
        ],
        inChair: [{ id: "c1", name: "Avery Cole", staffName: "Karissa", startedAt: new Date(now - 15 * 60_000).toISOString(), appointmentId: null }],
        stylists: [
          { id: A, name: "Karissa Frazier", inRotation: true, busyNow: true, turns: 2, next: now + 58 * 60_000, wait: "about 55–65 min" },
          { id: B, name: "Jordan Lee", inRotation: true, busyNow: false, turns: 1.5, next: now + 32 * 60_000, wait: "about 30–40 min" },
        ],
        anyone: { wait: "about 30–40 min", staffName: "Jordan", start: now + 32 * 60_000 },
      }}
    />
  );
}
