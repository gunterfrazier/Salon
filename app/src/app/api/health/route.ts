import { NextResponse } from "next/server";

/**
 * Health check: confirms the Supabase connection and that each table from
 * supabase/migrations exists. Uses only the public (publishable) key, which
 * row-level security limits to nothing; it never returns any key or data.
 */
export const dynamic = "force-dynamic";

const TABLES = [
  "businesses", "staff", "service_categories", "services", "clients", "policy_consents",
  "appointments", "client_flags", "appointment_services", "staff_busy_blocks",
  "payments", "balances", "color_formulas", "time_off", "messages",
];

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, supabase: "not configured" }, { status: 503 });
  }

  const results = await Promise.all(
    TABLES.map(async (t) => {
      try {
        const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=0`, { headers: { apikey: key }, cache: "no-store" });
        if (r.ok) return [t, "ok"] as const;
        // PostgREST error codes only (no messages): 42501 = exists but the public
        // role has no access (expected); PGRST205 / 42P01 = table missing.
        const code = ((await r.json().catch(() => ({}))) as { code?: string }).code ?? `http ${r.status}`;
        if (code === "42501") return [t, "ok"] as const;
        return [t, code === "PGRST205" || code === "42P01" ? "missing" : `error ${code}`] as const;
      } catch {
        return [t, "unreachable"] as const;
      }
    }),
  );
  const tables = Object.fromEntries(results);
  const ok = results.every(([, s]) => s === "ok");
  return NextResponse.json({ ok, supabase: "configured", tables }, { status: ok ? 200 : 500 });
}
