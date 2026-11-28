import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron/auth";
import { configuredSender } from "@/lib/notify/provider";
import { runMessages } from "@/lib/notify/run";
import { createAdminClient } from "@/lib/supabase/admin";
import { runLicenseReminders } from "@/lib/licenses/server";
import { runWalkinNotices } from "@/lib/walkins/server";

/** Run by the 5-minute timer: send due reminders, release unpaid holds, send day previews, license renewal reminders. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!(await isCronRequest(request.headers.get("x-chairvana-cron"), secret))) return NextResponse.json({ ok: false }, { status: 404 });
  const site = process.env.SITE_URL ?? request.nextUrl.origin;
  try {
    const db = createAdminClient();
    const now = new Date();
    const summary = await runMessages(db, configuredSender(), now, site);
    console.log(`[messages] ${JSON.stringify(summary)}`);
    // License renewal reminders (each goes out once; a failure here never stops the run above).
    const licenses = await runLicenseReminders(db, now).catch((e) => {
      console.error(`[licenses] ${(e as Error).message}`);
      return { sent: 0 };
    });
    const walkins = await runWalkinNotices(db, now).catch((e) => {
      console.error(`[walkins] ${(e as Error).message}`);
      return { sent: 0 };
    });
    return NextResponse.json({ ok: true, ...summary, licenseReminders: licenses.sent, walkinNotices: walkins.sent });
  } catch (e) {
    console.error(`[messages] run failed: ${(e as Error).message}`);
    return NextResponse.json({ ok: false, error: "Run failed" }, { status: 500 });
  }
}
