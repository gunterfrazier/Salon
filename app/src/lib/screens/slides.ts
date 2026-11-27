/** Screens around the salon: what each slide is, who may see it, and ready-made playlists. */

export type Audience = "public" | "staff";

export const SLIDE_TYPES = [
  "hours", "book", "specials", "reviews", "portfolio", "products", "image", "message", "openings", "team", "board",
  "today", "week", "month", "inventory", "colorwheel", "clientcard",
] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];

export interface SlideInfo {
  label: string;
  hint: string;
  /** public = safe for a screen anyone can see; staff = only on signed-in screens. */
  audience: Audience;
  seconds: number;
  /** Needs a touch screen to be useful. */
  touch?: boolean;
}

export const SLIDES: Record<SlideType, SlideInfo> = {
  hours: { label: "Hours sign", hint: "Open or closed right now, this week's hours and upcoming holiday closures.", audience: "public", seconds: 20 },
  book: { label: "Book online", hint: "A QR code and your short link.", audience: "public", seconds: 15 },
  specials: { label: "Specials", hint: "Your active promo codes.", audience: "public", seconds: 12 },
  reviews: { label: "5-star reviews", hint: "Your newest 5-star reviews, one at a time.", audience: "public", seconds: 12 },
  portfolio: { label: "Our work", hint: "Photos from your portfolio. Pick a stylist to show only their work.", audience: "public", seconds: 8 },
  products: { label: "Products", hint: "Retail products in stock, with prices.", audience: "public", seconds: 10 },
  image: { label: "Picture", hint: "A design from the Graphics studio, an upload or brand material.", audience: "public", seconds: 12 },
  message: { label: "Message", hint: "Your own headline and text: holiday hours, news, a welcome.", audience: "public", seconds: 12 },
  openings: { label: "Open times today", hint: "Times still open today (no client names).", audience: "public", seconds: 12 },
  team: { label: "Meet the team", hint: "Your stylists and their specialties.", audience: "public", seconds: 12 },
  board: { label: "Who's in the chair", hint: "Today's appointments, first name and last initial only.", audience: "public", seconds: 20 },
  today: { label: "Today's schedule", hint: "Every appointment today with client names, services and notes.", audience: "staff", seconds: 30 },
  week: { label: "This week", hint: "Seven days at a glance; days with open time stand out.", audience: "staff", seconds: 20 },
  month: { label: "This month", hint: "The month at a glance with booked and open days.", audience: "staff", seconds: 20 },
  inventory: { label: "Stock to reorder", hint: "Products that are low or out.", audience: "staff", seconds: 15 },
  colorwheel: { label: "Color wheel", hint: "Levels, tones and what neutralizes what.", audience: "staff", seconds: 30 },
  clientcard: { label: "Client card", hint: "Look up a client's formulas and notes (touch screens).", audience: "staff", seconds: 60, touch: true },
};

export interface Slide {
  id: string;
  type: SlideType;
  seconds: number;
  /** message: headline; image: caption. */
  title?: string;
  /** message: text. */
  body?: string;
  /** image: signage_media id. */
  mediaId?: string;
  /** portfolio / board / today: only this stylist. */
  staffId?: string;
  /** Stop showing after this date (YYYY-MM-DD), e.g. holiday hours. */
  until?: string;
}

export interface ScreenSettings {
  /** Tabs to switch slides, pause button, client lookup. */
  touch: boolean;
  /** Show the clock and salon name across the top. */
  header: boolean;
  /** 4–6 digits needed to unpair a TV from the screen itself. Never sent to the screen. */
  exitPin?: string | null;
}

export const DEFAULT_SETTINGS: ScreenSettings = { touch: false, header: true };

export interface Template {
  key: string;
  name: string;
  hint: string;
  audience: Audience;
  touch: boolean;
  slides: SlideType[];
}

export const TEMPLATES: Template[] = [
  { key: "window", name: "Front window sign", hint: "Open/closed and hours, facing the street.", audience: "public", touch: false, slides: ["hours", "book"] },
  { key: "lobby", name: "Waiting area", hint: "Promotions, products, your work and reviews.", audience: "public", touch: false, slides: ["board", "specials", "portfolio", "products", "reviews", "book"] },
  { key: "station", name: "Stylist station", hint: "Today's clients and the week's open time.", audience: "staff", touch: true, slides: ["today", "week"] },
  { key: "desk", name: "Front desk", hint: "Schedule, open days and what to reorder.", audience: "staff", touch: true, slides: ["today", "week", "month", "inventory"] },
  { key: "colorbar", name: "Color bar", hint: "Color wheel, client formulas and stock.", audience: "staff", touch: true, slides: ["clientcard", "colorwheel", "inventory"] },
  { key: "blank", name: "Start from scratch", hint: "An empty playlist.", audience: "public", touch: false, slides: [] },
];

const newId = () => Math.random().toString(36).slice(2, 10);

/** A playlist from a template's slide types. */
export function fromTemplate(t: Template): Slide[] {
  return t.slides.map((type) => ({ id: newId(), type, seconds: SLIDES[type].seconds }));
}

/** A new slide of a type, with its usual time on screen. */
export function newSlide(type: SlideType): Slide {
  return { id: newId(), type, seconds: SLIDES[type].seconds };
}

const UUID = /^[0-9a-f-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/**
 * Only known slides, sensible times and short texts. Public screens never keep
 * staff-only slides, so a client's details can't end up in a shop window.
 */
export function cleanPlaylist(raw: unknown, audience: Audience): Slide[] {
  if (!Array.isArray(raw)) return [];
  const out: Slide[] = [];
  for (const r of raw.slice(0, 40)) {
    if (!r || typeof r !== "object") continue;
    const s = r as Record<string, unknown>;
    const type = s.type as SlideType;
    if (!SLIDE_TYPES.includes(type)) continue;
    if (audience === "public" && SLIDES[type].audience === "staff") continue;
    const seconds = typeof s.seconds === "number" && Number.isFinite(s.seconds) ? Math.min(Math.max(Math.round(s.seconds), 5), 600) : SLIDES[type].seconds;
    const slide: Slide = { id: typeof s.id === "string" && /^[a-z0-9]{4,16}$/.test(s.id) ? s.id : newId(), type, seconds };
    const title = text(s.title, 80);
    const body = text(s.body, 400);
    if (title) slide.title = title;
    if (body) slide.body = body;
    if (typeof s.mediaId === "string" && UUID.test(s.mediaId)) slide.mediaId = s.mediaId;
    if (typeof s.staffId === "string" && UUID.test(s.staffId)) slide.staffId = s.staffId;
    if (typeof s.until === "string" && DATE.test(s.until)) slide.until = s.until;
    if (type === "image" && !slide.mediaId) continue;
    if (type === "message" && !slide.title && !slide.body) continue;
    out.push(slide);
  }
  return out;
}

export function cleanSettings(raw: unknown): ScreenSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pin = typeof r.exitPin === "string" && /^\d{4,6}$/.test(r.exitPin) ? r.exitPin : null;
  return { touch: r.touch === true, header: r.header !== false, ...(pin ? { exitPin: pin } : {}) };
}

/** Settings safe to hand to the screen itself (no PIN). */
export function playerSettings(s: ScreenSettings): ScreenSettings {
  return { touch: s.touch, header: s.header };
}

/** Slides still running today (an "until" date in the past drops out). */
export function liveSlides(playlist: Slide[], today: string): Slide[] {
  return playlist.filter((s) => !s.until || s.until >= today);
}
