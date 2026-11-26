import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron/auth";
import { configuredSender } from "@/lib/notify/provider";
import { runMessages } from "@/lib/notify/run";
import { createAdminClient } from "@/lib/supabase/admin";

/** Run by the 5-minute timer: send due reminders, release unpaid holds, send day previews. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!(await isCronRequest(request.headers.get("x-chairvana-cron"), secret))) return NextResponse.json({ ok: false }, { status: 404 });
  const site = process.env.SITE_URL ?? request.nextUrl.origin;
  try {
    const summary = await runMessages(createAdminClient(), configuredSender(), new Date(), site);
    console.log(`[messages] ${JSON.stringify(summary)}`);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error(`[messages] run failed: ${(e as Error).message}`);
    return NextResponse.json({ ok: false, error: "Run failed" }, { status: 500 });
  }
}
