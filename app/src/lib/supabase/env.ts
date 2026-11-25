/**
 * Supabase address and public (publishable) key, read at run time.
 *
 * Plain names (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) come first: they're read
 * when a request runs, so on Cloudflare they can be set as ordinary Worker
 * variables. NEXT_PUBLIC_* names are fallbacks (Vercel's Supabase integration
 * sets both), but Next.js bakes those in at build time.
 */
const read = (...names: string[]) => names.map((n) => process.env[n]).find((v) => !!v);

export const supabaseUrlOrNull = () => read("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") ?? null;

export const supabasePublicKeyOrNull = () =>
  read(
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ) ?? null;

export function supabaseUrl(): string {
  const v = supabaseUrlOrNull();
  if (!v) throw new Error("SUPABASE_URL is not set");
  return v;
}

export function supabasePublicKey(): string {
  const v = supabasePublicKeyOrNull();
  if (!v) throw new Error("SUPABASE_PUBLISHABLE_KEY is not set");
  return v;
}

export const supabaseConfigured = () => !!supabaseUrlOrNull() && !!supabasePublicKeyOrNull();
