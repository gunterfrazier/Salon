import { notFound } from "next/navigation";
import RemoteView from "@/app/app/screens/[id]/remote/RemoteView";
import { NO_CONTROL } from "@/lib/screens/playback";

/** Development-only preview of the screen remote (404 in production). */
export const dynamic = "force-dynamic";

export default function DevRemote() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <RemoteView
      id="00000000-0000-0000-0000-000000000001"
      name="Waiting area"
      source={{ screenId: "00000000-0000-0000-0000-000000000001", why: "own", name: "Waiting area" }}
      slides={[{ id: "a", label: "Who's in the chair", seconds: 20 }, { id: "b", label: "Specials", seconds: 12 }, { id: "c", label: "Our work", seconds: 8 }, { id: "d", label: "Book online", seconds: 15 }]}
      control={NO_CONTROL}
      serverNow={Date.UTC(2026, 10, 27, 16)}
      others={[{ id: "00000000-0000-0000-0000-000000000002", name: "Front window sign" }]}
      tz="America/Chicago"
    />
  );
}
