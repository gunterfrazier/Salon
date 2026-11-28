/**
 * Short salon links: chairvana.app/intensity-salon → the salon's page.
 * Words used by the site itself (or likely to be) can't be a salon's address.
 */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "apps", "auth", "book", "booking", "brand", "dev", "f", "o", "r", "s", "tv", "w",
  "find", "join", "signup", "signin", "login", "logout", "me", "settings", "new",
  "privacy", "terms", "texting", "help", "support", "about", "pricing", "blog", "contact",
  "favicon", "manifest", "robots", "sitemap", "sw", "static", "assets", "public", "www", "mail",
  "chairvana", "salon", "salons", "stylist", "stylists", "home", "account", "billing",
]);

/** The salon slug a one-segment path could point to, or null. */
export function shortSlug(pathname: string): string | null {
  const m = /^\/([A-Za-z0-9][A-Za-z0-9-]{2,47})\/?$/.exec(pathname);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  return RESERVED_SLUGS.has(slug) ? null : slug;
}

/** Can a salon use this address? */
export function slugAllowed(slug: string): boolean {
  return slug.length >= 3 && !RESERVED_SLUGS.has(slug);
}
