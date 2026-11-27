import { NextResponse, type NextRequest } from "next/server";
import { cleanControl } from "@/lib/screens/playback";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What a screen's TVs poll every few seconds: when its playlist last changed,
 * the remote's control state, and the server's clock (so TVs stay in step even
 * when their own clocks are off). Nothing about the salon's clients.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { data } = await createAdminClient().from("screens").select("updated_at,control").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ gone: true }, { status: 404 });
  return NextResponse.json({ updated: data.updated_at, control: cleanControl(data.control), now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
