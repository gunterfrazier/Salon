import { NextResponse, type NextRequest } from "next/server";
import { pairedDevice } from "@/lib/screens/device";
import { DEVICE_COOKIE } from "@/lib/screens/pairing";
import { createAdminClient } from "@/lib/supabase/admin";

/** A paired TV checking in every couple of minutes: "I'm on, playing this, N pictures saved". */
export async function POST(req: NextRequest) {
  const d = await pairedDevice();
  if (!d) {
    const res = NextResponse.json({ paired: false }, { status: 401 });
    res.cookies.delete(DEVICE_COOKIE);
    return res;
  }
  const b = (await req.json().catch(() => ({}))) as { slide?: unknown; saved?: unknown; total?: unknown; offline?: unknown };
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(10000, Math.round(v))) : null);
  const health = {
    slide: typeof b.slide === "string" ? b.slide.slice(0, 40) : null,
    saved: n(b.saved),
    total: n(b.total),
    at: new Date().toISOString(),
  };
  await createAdminClient()
    .from("screen_devices")
    .update({ last_seen: new Date().toISOString(), health, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200) })
    .eq("id", d.id);
  return NextResponse.json({ paired: true, screenId: d.screenId });
}
