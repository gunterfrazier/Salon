import { NextResponse, type NextRequest } from "next/server";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, newKey, normalizeCode, pairCode, sha256 } from "@/lib/screens/pairing";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A TV asking to be paired.
 *  { action: "start" } → { code, secret }   (the TV shows the code)
 *  { action: "poll", code, secret } → { paired } and, once someone typed the code in the app,
 *    the TV's own key as a cookie.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string; secret?: string };
  const db = createAdminClient();

  if (body.action === "start") {
    // Tidy up old codes now and then.
    await db.from("screen_pair_codes").delete().lt("expires_at", new Date(Date.now() - 3_600_000).toISOString());
    const secret = newKey();
    for (let i = 0; i < 5; i++) {
      const code = pairCode();
      const { error } = await db.from("screen_pair_codes").insert({ code, secret_hash: await sha256(secret) });
      if (!error) return NextResponse.json({ code, secret, expiresInSeconds: 900 });
    }
    return NextResponse.json({ error: "Try again." }, { status: 503 });
  }

  if (body.action === "poll") {
    const code = normalizeCode(body.code ?? "");
    if (!code || typeof body.secret !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { data: row } = await db.from("screen_pair_codes").select("secret_hash,expires_at,device_key").eq("code", code).maybeSingle();
    if (!row || row.secret_hash !== (await sha256(body.secret))) return NextResponse.json({ expired: true });
    if (!row.device_key) return NextResponse.json({ paired: false, expired: Date.parse(row.expires_at) < Date.now() });
    await db.from("screen_pair_codes").delete().eq("code", code);
    const res = NextResponse.json({ paired: true });
    res.cookies.set(DEVICE_COOKIE, row.device_key, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: DEVICE_COOKIE_MAX_AGE });
    return res;
  }

  return NextResponse.json({ error: "Bad request." }, { status: 400 });
}
