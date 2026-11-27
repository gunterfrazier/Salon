/** Spot clients that were probably made while trying the app out. */

const WORDS = /\b(test|testing|tester|demo|fake|sample|dummy|asdf|qwerty|placeholder)\b/i;
const NAMES = /^(john|jane) doe$/i;
const EMAILS = /@(example\.(com|org|net)|test\.com|mailinator\.com)$/i;

export function looksLikeTest(c: { name: string; email?: string | null; contact?: string | null }): boolean {
  const name = c.name.trim();
  if (WORDS.test(name) || NAMES.test(name)) return true;
  if (c.email && (EMAILS.test(c.email) || /^test(\d*|[._+-][\w.+-]*)@/i.test(c.email))) return true;
  // 555-0100 to 555-0199 are set aside for made-up numbers.
  const digits = (c.contact ?? "").replace(/\D/g, "");
  return /55501\d\d$/.test(digits);
}
