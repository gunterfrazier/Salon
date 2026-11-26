/**
 * Locations for the marketplace. Salon addresses are located once when saved
 * (US Census geocoder, free, no key); customers search by ZIP or "City, ST"
 * (Zippopotam.us). Only addresses/ZIPs/cities are sent, never names or contact details.
 */

export interface Point {
  lat: number;
  lng: number;
}

/** Great-circle distance in miles. */
export function milesBetween(a: Point, b: Point): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type PlaceQuery = { kind: "zip"; zip: string } | { kind: "city"; city: string; state: string } | null;

const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" "));

/** "35274", "35274-1234", "Ranburne, AL" or "Ranburne AL" → a query; anything else → null. */
export function parsePlace(input: string): PlaceQuery {
  const t = input.trim();
  const zip = /^(\d{5})(?:-\d{4})?$/.exec(t);
  if (zip) return { kind: "zip", zip: zip[1] };
  const m = /^(.+?)[,\s]+([A-Za-z]{2})$/.exec(t);
  if (m && STATES.has(m[2].toUpperCase())) return { kind: "city", city: m[1].trim().replace(/\s+/g, " "), state: m[2].toUpperCase() };
  return null;
}

type Fetch = typeof fetch;

/** Center of a ZIP code or city. */
export async function locatePlace(q: NonNullable<PlaceQuery>, fetcher: Fetch = fetch): Promise<(Point & { label: string }) | null> {
  const url = q.kind === "zip" ? `https://api.zippopotam.us/us/${q.zip}` : `https://api.zippopotam.us/us/${q.state.toLowerCase()}/${encodeURIComponent(q.city.toLowerCase())}`;
  try {
    const res = await fetcher(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = (await res.json()) as { places?: { latitude: string; longitude: string; "place name": string; "state abbreviation"?: string }[]; "state abbreviation"?: string };
    const places = j.places ?? [];
    if (!places.length) return null;
    const lat = places.reduce((n, p) => n + Number(p.latitude), 0) / places.length;
    const lng = places.reduce((n, p) => n + Number(p.longitude), 0) / places.length;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const label = q.kind === "zip" ? `${places[0]["place name"]}, ${places[0]["state abbreviation"] ?? ""} ${q.zip}`.trim() : `${q.city}, ${q.state}`;
    return { lat, lng, label };
  } catch {
    return null;
  }
}

/** A street address → point (US Census geocoder), falling back to the ZIP's center. */
export async function locateAddress(a: { street: string; city: string; state: string; zip: string }, fetcher: Fetch = fetch): Promise<Point | null> {
  const line = [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ");
  if (a.street && (a.zip || (a.city && a.state))) {
    try {
      const res = await fetcher(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(line)}&benchmark=Public_AR_Current&format=json`);
      if (res.ok) {
        const j = (await res.json()) as { result?: { addressMatches?: { coordinates: { x: number; y: number } }[] } };
        const hit = j.result?.addressMatches?.[0]?.coordinates;
        if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.y)) return { lat: hit.y, lng: hit.x };
      }
    } catch {
      /* fall through to the ZIP */
    }
  }
  const q = /^\d{5}/.test(a.zip) ? parsePlace(a.zip.slice(0, 5)) : a.city && a.state ? parsePlace(`${a.city}, ${a.state}`) : null;
  return q ? locatePlace(q, fetcher) : null;
}

/** "intensity-salon" from "Intensity Salon!". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "salon"
  );
}
