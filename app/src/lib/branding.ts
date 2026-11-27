/** A salon's own look: logo, cover photo and accent color. */

export interface Branding {
  /** Hex like #3f6a84, or null for the Chairvana default. */
  accent: string | null;
  /** Storage paths in the salon-media bucket. */
  logoPath: string | null;
  coverPath: string | null;
}

export const EMPTY_BRANDING: Branding = { accent: null, logoPath: null, coverPath: null };

const HEX = /^#[0-9a-f]{6}$/i;

export function branding(stored: unknown): Branding {
  const b = (stored ?? {}) as Partial<Branding>;
  const path = (p: unknown) => (typeof p === "string" && /^[0-9a-f-]{36}\/[\w./-]{1,120}$/.test(p) ? p : null);
  return { accent: typeof b.accent === "string" && HEX.test(b.accent) ? b.accent.toLowerCase() : null, logoPath: path(b.logoPath), coverPath: path(b.coverPath) };
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Text color that reads best on the accent: white or obsidian. */
export function onAccent(accent: string): string {
  return contrast(accent, "#ffffff") >= contrast(accent, "#0f0f11") ? "#ffffff" : "#0f0f11";
}

/** Inline CSS variables that re-color a salon's pages, or nothing for the default. */
export function accentStyle(b: Pick<Branding, "accent">): Record<string, string> | undefined {
  if (!b.accent) return undefined;
  return { "--accent": b.accent, "--on-accent": onAccent(b.accent) };
}

/** Suggested accents that suit salon brands (all readable with white or dark text). */
export const ACCENT_PRESETS = [
  ["Mist water", "#3f6a84"],
  ["Rose gold", "#b76e79"],
  ["Plum", "#6b3a5b"],
  ["Sage", "#5f7a61"],
  ["Terracotta", "#b5543a"],
  ["Champagne", "#c8a96a"],
  ["Ocean", "#1f5f8b"],
  ["Obsidian", "#141417"],
] as const;
