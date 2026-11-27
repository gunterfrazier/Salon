import { notFound } from "next/navigation";
import DisplayView from "@/app/app/display/DisplayView";
import { buildBoard } from "@/lib/display/board";

/** Development-only preview of the salon display (404 in production). */
export const dynamic = "force-dynamic";

export default function DevDisplay() {
  if (process.env.NODE_ENV === "production") notFound();
  const d = (h: number, m = 0) => new Date(Date.UTC(2026, 11, 1, h + 6, m)).toISOString();
  const now = new Date(d(10, 40));
  const board = buildBoard(
    [
      { id: "1", staffId: "k", clientName: "Morgan Tate", start: d(9), end: d(10), status: "completed", services: ["Women's Cut"] },
      { id: "2", staffId: "k", clientName: "Jamie Rivers", start: d(10, 30), end: d(13), status: "in_service", services: ["All Over Color", "Style"] },
      { id: "3", staffId: "k", clientName: "Taylor Brooks", start: d(13, 30), end: d(14, 30), status: "checked_in", services: ["Blowout"] },
      { id: "4", staffId: "k", clientName: "Riley Chen", start: d(15), end: d(16), status: "booked", services: ["Women's Cut"] },
      { id: "5", staffId: "s", clientName: "Ava Moore", start: d(11), end: d(12), status: "booked", services: ["Men's Cut"] },
    ],
    [{ id: "k", name: "Karissa Frazier" }, { id: "s", name: "Sam Lee" }],
    now,
  );
  return (
    <DisplayView
      salon="Intensity Salon"
      logoUrl={null}
      tz="America/Chicago"
      date="2026-12-01"
      today="2026-12-01"
      prev="2026-11-30"
      next="2026-12-02"
      closedLabel={null}
      board={board}
      openings={[{ stylist: "Sam", start: d(14), minutes: 90 }]}
      specials={[{ code: "WINTER15", text: "15% off color in December", until: "2026-12-31" }]}
      reviews={[{ text: "Karissa nailed my copper balayage. Best salon in town!", name: "Jamie R." }]}
      bookUrl="https://chairvana.app/s/intensity-salon/book"
      touch
    />
  );
}
