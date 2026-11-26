/**
 * The 5-minute timer (worker.ts) calls /api/cron/* inside the same worker with
 * a token derived from the server's Supabase secret key. No extra secret to
 * manage, and the key itself never leaves the server.
 */
export async function cronToken(secret: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`chairvana-cron:${secret}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isCronRequest(header: string | null, secret: string | undefined): Promise<boolean> {
  if (!header || !secret) return false;
  const want = await cronToken(secret);
  if (header.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= header.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
