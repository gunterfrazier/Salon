import { describe, expect, it } from "vitest";
import { locateAddress, locatePlace, milesBetween, parsePlace, slugify } from "./geo";

describe("geo", () => {
  it("measures miles", () => {
    // Ranburne, AL to Heflin, AL is about 13 miles.
    expect(milesBetween({ lat: 33.5262, lng: -85.3405 }, { lat: 33.6487, lng: -85.5875 })).toBeGreaterThan(12);
    expect(milesBetween({ lat: 33.5262, lng: -85.3405 }, { lat: 33.6487, lng: -85.5875 })).toBeLessThan(18);
    expect(milesBetween({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
  });

  it("reads ZIPs and City, ST", () => {
    expect(parsePlace("36280")).toEqual({ kind: "zip", zip: "36280" });
    expect(parsePlace(" 36280-1234 ")).toEqual({ kind: "zip", zip: "36280" });
    expect(parsePlace("Ranburne, al")).toEqual({ kind: "city", city: "Ranburne", state: "AL" });
    expect(parsePlace("Fort  Payne AL")).toEqual({ kind: "city", city: "Fort Payne", state: "AL" });
    expect(parsePlace("somewhere")).toBeNull();
    expect(parsePlace("Paris, XX")).toBeNull();
  });

  it("locates a ZIP and falls back from address to ZIP", async () => {
    const zippo = (async (url: string) => {
      if (url.includes("zippopotam")) return new Response(JSON.stringify({ places: [{ latitude: "33.35", longitude: "-85.35", "place name": "Woodland", "state abbreviation": "AL" }] }));
      return new Response(JSON.stringify({ result: { addressMatches: [] } }));
    }) as unknown as typeof fetch;
    expect(await locatePlace({ kind: "zip", zip: "36280" }, zippo)).toEqual({ lat: 33.35, lng: -85.35, label: "Woodland, AL 36280" });
    expect(await locateAddress({ street: "1 Nowhere Rd", city: "Woodland", state: "AL", zip: "36280" }, zippo)).toMatchObject({ lat: 33.35, lng: -85.35 });
    const down = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await locatePlace({ kind: "zip", zip: "36280" }, down)).toBeNull();
  });

  it("makes slugs", () => {
    expect(slugify("Intensity Salon!")).toBe("intensity-salon");
    expect(slugify("Café Crème & Co.")).toBe("cafe-creme-co");
    expect(slugify("!!!")).toBe("salon");
  });
});
