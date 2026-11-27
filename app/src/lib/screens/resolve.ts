import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Hours } from "../booking/availability";
import { loadDaysOff } from "../data/schedule";
import { closureForDate, mergeHolidays } from "../schedule/holidays";
import { addDays, todayIn, wallParts, weekday, zonedToUtc } from "../time/zone";
import { loadScreenData, type ScreenData } from "./data";
import { cleanControl, playlistSource, type Control, type Source } from "./playback";
import { openStatus } from "./schedule";
import { cleanPlaylist, cleanSettings, liveSlides, type Audience, type ScreenSettings, type Slide } from "./slides";

export interface Resolved {
  screenId: string;
  name: string;
  audience: Audience;
  settings: ScreenSettings;
  slides: Slide[];
  data: ScreenData;
  control: Control;
  source: Source & { name: string };
  /** Changes when what this screen plays changes (its playlist, its source's playlist, or the source itself). */
  rev: string;
  /** Server clock (ms) when this was worked out. */
  serverNow: number;
}

/**
 * Everything a screen needs right now: whose playlist plays (remote override,
 * schedule, "when closed", or its own), its slides and their data. Slides are
 * always filtered by the screen's own audience, so a public TV never shows a
 * staff playlist's client details.
 */
export async function resolveScreen(db: SupabaseClient, businessId: string, screenId: string, opts: { onlyStaffId?: string | null; now?: Date } = {}): Promise<Resolved | null> {
  const now = opts.now ?? new Date();
  const p = await resolvePlaylist(db, businessId, screenId, now);
  if (!p) return null;
  const data = await loadScreenData(db, businessId, p.slides, p.audience, { now, onlyStaffId: opts.onlyStaffId });
  return { ...p, data };
}

/** Whose playlist plays and its slides, without loading the slides' data (for the remote). */
export async function resolvePlaylist(db: SupabaseClient, businessId: string, screenId: string, now = new Date()): Promise<Omit<Resolved, "data"> | null> {
  const { data: s } = await db.from("screens").select("id,name,audience,playlist,settings,control,updated_at").eq("id", screenId).eq("business_id", businessId).maybeSingle();
  if (!s) return null;
  const { data: b } = await db.from("businesses").select("timezone,business_hours,holidays").eq("id", businessId).single();
  const tz = (b?.timezone as string) ?? "America/Chicago";
  const audience: Audience = s.audience === "staff" ? "staff" : "public";
  const settings = cleanSettings(s.settings);
  const control = cleanControl(s.control);

  // Closed right now? (only needed for a "when closed" choice)
  let closed = false;
  if (settings.whenClosed) {
    const today = todayIn(tz, now);
    const daysOff = await loadDaysOff(db, businessId, zonedToUtc(today, 0, tz), zonedToUtc(addDays(today, 8), 0, tz));
    const rules = mergeHolidays(b?.holidays);
    const closedOn = (d: string) => {
      const c = closureForDate(d, tz, rules, daysOff);
      return c && c.kind !== "blocked_hours" ? c.label || "Closed" : null;
    };
    closed = !openStatus(now, tz, (b?.business_hours ?? {}) as Hours, closedOn).open;
  }
  const wall = wallParts(now, tz);
  const source = playlistSource(s.id, control, settings.schedule ?? [], settings.whenClosed ?? null, { nowMs: now.getTime(), day: weekday(wall.date), minute: wall.minutes, closed });

  let playlist: unknown = s.playlist;
  let sourceName = s.name as string;
  let sourceRev = "";
  if (source.screenId !== s.id) {
    const { data: other } = await db.from("screens").select("name,playlist,updated_at").eq("id", source.screenId).eq("business_id", businessId).maybeSingle();
    if (other) {
      playlist = other.playlist;
      sourceName = other.name;
      sourceRev = other.updated_at;
    } else {
      source.screenId = s.id;
      source.why = "own";
    }
  }
  const slides = liveSlides(cleanPlaylist(playlist, audience), todayIn(tz, now));
  return {
    screenId: s.id,
    name: s.name,
    audience,
    settings,
    slides,
    control,
    source: { ...source, name: sourceName },
    rev: `${s.updated_at}|${source.screenId}|${sourceRev}`,
    serverNow: now.getTime(),
  };
}
