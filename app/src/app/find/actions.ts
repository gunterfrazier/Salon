"use server";

import type { SearchCriteria } from "@/lib/booking/search";
import { openingsAcross, salonsNear, type NearbySalon, type SalonResult } from "@/lib/discovery/openings";
import { locatePlace, parsePlace } from "@/lib/geo";

export type AreaSearch =
  | { ok: true; place: string; salons: NearbySalon[]; results: SalonResult[] | null }
  | { ok: false; error: string };

const MILES = [5, 10, 25, 50, 100];

/** Salons near a ZIP/city and, when a service is named, their next openings for it. */
export async function searchArea(input: { where: string; miles: number; service: string; criteria: SearchCriteria }): Promise<AreaSearch> {
  const q = parsePlace(input.where ?? "");
  if (!q) return { ok: false, error: "Enter a 5-digit ZIP or City, ST." };
  const at = await locatePlace(q);
  if (!at) return { ok: false, error: "We couldn't find that place. Check the ZIP or city." };
  const miles = MILES.includes(input.miles) ? input.miles : 25;
  const salons = await salonsNear(at, miles);
  const service = (input.service ?? "").trim().slice(0, 60);
  const results = service && salons.length ? await openingsAcross(salons.slice(0, 15), [service], input.criteria) : null;
  return { ok: true, place: at.label, salons, results };
}
