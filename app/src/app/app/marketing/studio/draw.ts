/** Draws social graphics on a canvas: posts (1080×1080) and stories (1080×1920). */

import type { Wrapped } from "@/lib/studio/wrapped";

export type Template = "openings" | "special" | "review" | "book" | "closed" | "wrapped";

export interface Fonts {
  display: string;
  sans: string;
  mono: string;
  wordmark: string;
}

export interface Art {
  template: Template;
  w: number;
  h: number;
  salon: string;
  url: string;
  accent: string;
  onAccent: string;
  fonts: Fonts;
  photo: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  mark: HTMLImageElement | null;
  headline: string;
  sub: string;
  lines: string[];
  code?: string;
  wrapped?: Wrapped;
}

const INK = "#f5efe6";
const MUTED = "rgba(245,239,230,0.72)";
const BG = "#0f0f11";

/** Wrap text to a width; returns lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** Draw text lines; returns the y after the last line. */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: { font: string; color?: string; max: number; lh: number; align?: CanvasTextAlign; maxLines?: number }): number {
  ctx.font = o.font;
  ctx.fillStyle = o.color ?? INK;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "alphabetic";
  let lines = wrap(ctx, s, o.max);
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:!?]?$/, "")}…`;
  }
  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += o.lh;
  }
  return y;
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * r;
  const ih = img.naturalHeight * r;
  ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
}

function pill(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, a: Art, size: number) {
  ctx.font = `600 ${size}px ${a.fonts.sans}`;
  const tw = ctx.measureText(label).width;
  const padX = size * 1.1;
  const hgt = size * 2.3;
  ctx.fillStyle = a.accent;
  ctx.beginPath();
  ctx.roundRect(x, y, tw + padX * 2, hgt, hgt / 2);
  ctx.fill();
  ctx.fillStyle = a.onAccent;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, y + hgt / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

export function draw(canvas: HTMLCanvasElement, a: Art) {
  canvas.width = a.w;
  canvas.height = a.h;
  const ctx = canvas.getContext("2d")!;
  const { w, h } = a;
  const pad = Math.round(w * 0.08);
  const story = h > w;
  const S = w / 1080;

  // Background: photo with a dark scrim, or obsidian with soft rings.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  if (a.photo && a.template !== "wrapped") {
    cover(ctx, a.photo, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(15,15,17,0.35)");
    g.addColorStop(0.45, "rgba(15,15,17,0.55)");
    g.addColorStop(1, "rgba(15,15,17,0.92)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.strokeStyle = a.accent;
    ctx.globalAlpha = 0.12;
    for (const r of [0.55, 0.42, 0.29]) {
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.arc(w * 0.85, h * 0.18, w * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Header: logo or mark + salon name.
  const top = pad;
  const badge = 84 * S;
  if (a.logo) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, top, badge, badge, 18 * S);
    ctx.clip();
    const r = Math.max(badge / a.logo.naturalWidth, badge / a.logo.naturalHeight);
    ctx.drawImage(a.logo, pad + (badge - a.logo.naturalWidth * r) / 2, top + (badge - a.logo.naturalHeight * r) / 2, a.logo.naturalWidth * r, a.logo.naturalHeight * r);
    ctx.restore();
  } else if (a.mark) {
    const mh = 64 * S;
    ctx.drawImage(a.mark, pad, top + 10 * S, (a.mark.naturalWidth / a.mark.naturalHeight) * mh, mh);
  }
  text(ctx, a.salon, pad + badge + 24 * S, top + 58 * S, { font: `500 ${44 * S}px ${a.fonts.display}`, max: w - pad * 2 - badge, lh: 50 * S, maxLines: 1 });

  // Body.
  let y = story ? h * 0.36 : h * 0.3;
  const max = w - pad * 2;
  if (a.template === "openings") {
    text(ctx, "OPENINGS", pad, y, { font: `600 ${28 * S}px ${a.fonts.sans}`, color: a.accent, max, lh: 40 * S });
    y = text(ctx, a.headline || "This week", pad, y + 78 * S, { font: `400 ${88 * S}px ${a.fonts.display}`, max, lh: 92 * S, maxLines: 2 });
    y += 20 * S;
    for (const l of (a.lines.length ? a.lines : ["Ask about this week's times"]).slice(0, story ? 8 : 5)) {
      ctx.fillStyle = a.accent;
      ctx.beginPath();
      ctx.arc(pad + 9 * S, y - 13 * S, 7 * S, 0, Math.PI * 2);
      ctx.fill();
      y = text(ctx, l, pad + 34 * S, y, { font: `400 ${40 * S}px ${a.fonts.sans}`, max: max - 34 * S, lh: 62 * S, maxLines: 1 });
    }
  } else if (a.template === "special") {
    text(ctx, "SPECIAL", pad, y, { font: `600 ${28 * S}px ${a.fonts.sans}`, color: a.accent, max, lh: 40 * S });
    y = text(ctx, a.headline || "Something special", pad, y + 96 * S, { font: `400 ${104 * S}px ${a.fonts.display}`, max, lh: 108 * S, maxLines: 4 });
    if (a.code) {
      y += 30 * S;
      text(ctx, "Use code", pad, y, { font: `400 ${36 * S}px ${a.fonts.sans}`, color: MUTED, max, lh: 44 * S });
      text(ctx, a.code, pad, y + 86 * S, { font: `500 ${84 * S}px ${a.fonts.mono}`, max, lh: 90 * S });
      y += 110 * S;
    }
    if (a.sub) text(ctx, a.sub, pad, y + 40 * S, { font: `400 ${34 * S}px ${a.fonts.sans}`, color: MUTED, max, lh: 44 * S, maxLines: 2 });
  } else if (a.template === "review") {
    ctx.fillStyle = "#f5b301";
    ctx.font = `${60 * S}px ${a.fonts.sans}`;
    ctx.textAlign = "left";
    ctx.fillText("★★★★★", pad, y);
    y = text(ctx, `“${a.headline || "Loved my visit!"}”`, pad, y + 100 * S, { font: `italic 400 ${68 * S}px ${a.fonts.display}`, max, lh: 80 * S, maxLines: story ? 9 : 6 });
    text(ctx, `— ${a.sub || "A happy client"}`, pad, y + 30 * S, { font: `500 ${36 * S}px ${a.fonts.sans}`, color: MUTED, max, lh: 44 * S });
  } else if (a.template === "book" || a.template === "closed") {
    y = text(ctx, a.headline || (a.template === "book" ? "Love the look?" : "We're closed"), pad, y + 40 * S, { font: `400 ${112 * S}px ${a.fonts.display}`, max, lh: 116 * S, maxLines: 4 });
    text(ctx, a.sub || (a.template === "book" ? "Book your next visit online." : "We'll see you soon."), pad, y + 30 * S, { font: `400 ${42 * S}px ${a.fonts.sans}`, color: MUTED, max, lh: 54 * S, maxLines: 3 });
  } else if (a.template === "wrapped" && a.wrapped) {
    const r = a.wrapped;
    if (!story) y = h * 0.25;
    const row = (story ? 190 : 168) * S;
    text(ctx, `CHAIR WRAPPED ${r.year}`, pad, y - 40 * S, { font: `400 ${30 * S}px ${a.fonts.wordmark}`, color: a.accent, max, lh: 40 * S });
    y = text(ctx, a.headline || "Thank you for an amazing year", pad, y + 50 * S, { font: `400 ${74 * S}px ${a.fonts.display}`, max, lh: 80 * S, maxLines: 2 });
    const all: [string, string][] = [
      [String(r.visits), "visits"],
      [String(r.clients), "clients"],
      [String(r.newClients), "new faces"],
      [String(r.hours), "hours in the chair"],
    ];
    if (r.fiveStar) all.push([String(r.fiveStar), "5-star reviews"]);
    if (r.regulars) all.push([String(r.regulars), "regulars"]);
    const stats = all.slice(0, story ? 6 : 4);
    const cols = 2;
    const cw = max / cols;
    y += 30 * S;
    stats.forEach(([n, l], i) => {
      const cx = pad + (i % cols) * cw;
      const cy = y + Math.floor(i / cols) * row;
      text(ctx, n, cx, cy + 100 * S, { font: `400 ${110 * S}px ${a.fonts.display}`, max: cw, lh: 110 * S });
      text(ctx, l, cx, cy + 156 * S, { font: `400 ${32 * S}px ${a.fonts.sans}`, color: MUTED, max: cw - 20 * S, lh: 38 * S });
    });
    y += Math.ceil(stats.length / cols) * row + 20 * S;
    if (r.topService && y + 30 * S < h - pad - 140 * S) text(ctx, `Most booked: ${r.topService}${r.busiestMonth ? ` · Busiest month: ${r.busiestMonth}` : ""}`, pad, y + 30 * S, { font: `400 ${32 * S}px ${a.fonts.sans}`, color: MUTED, max, lh: 42 * S, maxLines: 2 });
  }

  // Footer: call to action and the booking address.
  const fy = h - pad - 110 * S;
  pill(ctx, a.template === "closed" ? "Book online any time" : "Book online", pad, fy, a, 32 * S);
  text(ctx, a.url.replace(/^https:\/\//, ""), pad, fy + 130 * S, { font: `400 ${30 * S}px ${a.fonts.sans}`, color: MUTED, max, lh: 36 * S, maxLines: 1 });
}
