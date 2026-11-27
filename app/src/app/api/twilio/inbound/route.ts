import { NextResponse, type NextRequest } from "next/server";
import { replyKeyword, sameSignature, twilioSignature } from "@/lib/notify/inbound";
import { setTextingFor } from "@/lib/notify/optout";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Empty reply: Twilio answers STOP and HELP itself (its opt-out settings), so we add nothing. */
const twiml = () => new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { "content-type": "text/xml" } });

/**
 * Twilio calls this when a client texts the salon number. Only requests signed
 * with this account's auth token are accepted. STOP turns off "OK to text" for
 * that number everywhere; START turns it back on where it was on before.
 */
export async function POST(request: NextRequest) {
  const token = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  if (!token) return NextResponse.json({ ok: false }, { status: 404 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false }, { status: 400 });
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  // Twilio signs the public address it called (the site URL, not the internal one).
  const site = (process.env.SITE_URL ?? "https://chairvana.app").replace(/\/$/, "");
  const expected = await twilioSignature(token, `${site}/api/twilio/inbound`, params);
  if (!sameSignature(request.headers.get("x-twilio-signature") ?? "", expected)) return NextResponse.json({ ok: false }, { status: 403 });

  const kw = replyKeyword(params.Body ?? "", params.OptOutType);
  if ((kw === "stop" || kw === "start") && params.From) {
    const r = await setTextingFor(createAdminClient(), params.From, kw === "start");
    console.log(`[sms] ${kw} from …${params.From.slice(-4)}: ${r.changed} record(s) updated`);
  }
  return twiml();
}
