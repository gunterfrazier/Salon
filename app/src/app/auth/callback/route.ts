import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** The emailed sign-in link lands here and is swapped for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const home = new URL("/dashboard", request.url);
  const fail = new URL("/login?error=link", request.url);
  if (!code) return NextResponse.redirect(fail);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(error ? fail : home);
}
