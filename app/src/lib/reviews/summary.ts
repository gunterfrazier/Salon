/** Review rules and summaries (no database here, so it's easy to test). */

export interface ReviewSummary {
  count: number;
  /** Average to one decimal, or null with no reviews. */
  average: number | null;
  /** How many of each star, index 0 = 1 star … 4 = 5 stars. */
  histogram: [number, number, number, number, number];
}

export function summarize(ratings: number[]): ReviewSummary {
  const h: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const ok = ratings.filter((r) => Number.isInteger(r) && r >= 1 && r <= 5);
  for (const r of ok) h[r - 1]++;
  return { count: ok.length, average: ok.length ? Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 10) / 10 : null, histogram: h };
}

/** "Jamie R." Public reviews never show a full last name. */
export function displayName(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first ?? "").trim().split(/\s+/)[0] ?? "";
  const l = (last ?? "").trim();
  if (!f) return "A client";
  return l ? `${f} ${l[0].toUpperCase()}.` : f;
}

/** 4-5 stars with permission → shown on the salon page; anything else stays private feedback. */
export function statusFor(rating: number, share: boolean): "published" | "private" {
  return rating >= 4 && share ? "published" : "private";
}

/** Clean what a client typed. */
export function cleanReview(rating: unknown, body: unknown): { ok: true; rating: number; body: string | null } | { ok: false; error: string } {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return { ok: false, error: "Tap the stars to rate your visit." };
  const b = typeof body === "string" ? body.replace(/\s+\n/g, "\n").trim().slice(0, 1500) : "";
  return { ok: true, rating: r, body: b || null };
}
