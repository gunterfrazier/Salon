/**
 * Who may sign in. OWNER_EMAILS is a comma-separated list set in Vercel
 * (Settings > Environment Variables), so addresses never live in the code.
 */
export function ownerEmails(raw = process.env.OWNER_EMAILS ?? ""): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

export function isOwnerEmail(email: string, raw?: string): boolean {
  return ownerEmails(raw).includes(email.trim().toLowerCase());
}
