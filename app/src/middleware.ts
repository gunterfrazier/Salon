import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicKeyOrNull, supabaseUrlOrNull } from "@/lib/supabase/env";

/** Pages anyone can open without signing in. */
const PUBLIC = [/^\/app\/login(\/|$)/, /^\/auth\//, /^\/api\/health$/, /^\/api\/cron\//, /^\/book(\/|$)/, /^\/s\//, /^\/find(\/|$)/, /^\/join(\/|$)/, /^\/signup(\/|$)/, /^\/$/, /^\/(privacy|terms|texting)$/, /^\/f\//, /^\/r\//];

/**
 * Edge middleware (not proxy.ts): the Cloudflare/OpenNext build supports Edge
 * middleware reliably, while Node "proxy" support is still experimental there.
 *
 * Keeps the Supabase session cookie fresh and sends signed-out visitors to
 * /app/login. Pages still check the user themselves; this is the first gate.
 */
export async function middleware(request: NextRequest) {
  const url = supabaseUrlOrNull();
  const key = supabasePublicKeyOrNull();
  const isPublic = PUBLIC.some((p) => p.test(request.nextUrl.pathname));

  // Before Supabase is configured (local preview), leave pages open.
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/app/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
