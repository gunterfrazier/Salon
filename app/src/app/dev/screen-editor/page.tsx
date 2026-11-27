import { notFound } from "next/navigation";
import ScreenEditor from "@/app/app/screens/[id]/ScreenEditor";
import { fromTemplate, TEMPLATES } from "@/lib/screens/slides";

/** Development-only preview of the screen editor (404 in production). */
export const dynamic = "force-dynamic";

export default function DevScreenEditor() {
  if (process.env.NODE_ENV === "production") notFound();
  const playlist = [...fromTemplate(TEMPLATES[1]), { id: "msg1", type: "message" as const, seconds: 12, title: "Holiday hours", body: "Closed Dec 24–25", until: "2026-12-26" }];
  return (
    <ScreenEditor
      screen={{ id: "00000000-0000-0000-0000-000000000001", name: "Waiting area", audience: "public", playlist, settings: { touch: false, header: true }, link: "https://chairvana.app/tv/abc123" }}
      media={[{ id: "00000000-0000-0000-0000-0000000000aa", url: "/brand/og.png", title: "Holiday promo" }]}
      stylists={[{ id: "k", name: "Karissa Frazier" }, { id: "s", name: "Sam Lee" }]}
    />
  );
}
