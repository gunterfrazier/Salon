import { describe, expect, it } from "vitest";
import { cleanGroupName, cleanOwn, cleanService, dollarsToCents, moveItem, offerChanges, offeredBy, uniqueKey, withOwn } from "./edit";

const CAT = "00000000-0000-4000-8000-000000000001";
const base = { name: "Women's Cut", categoryId: CAT, description: "", priceType: "fixed", price: "35", active: 45, processing: 0, finish: 0, bookDuringProcessing: true, depositCategory: "standard", stage: "cut", bookableOnline: true, isAddOn: false };

describe("service editing", () => {
  it("reads dollars", () => {
    expect(dollarsToCents("35")).toBe(3500);
    expect(dollarsToCents("$35.5")).toBe(3550);
    expect(dollarsToCents("1,200.00")).toBe(120000);
    expect(dollarsToCents("-5")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("3.999")).toBeNull();
  });

  it("checks a service", () => {
    const r = cleanService({ ...base, name: "  Women's   Cut ", description: " Detail " });
    expect(r).toMatchObject({ ok: true, value: { name: "Women's Cut", price_cents: 3500, active_min: 45, description: "Detail", stage: "cut", bookable_online: true } });
    expect(cleanService({ ...base, name: "" })).toMatchObject({ ok: false });
    expect(cleanService({ ...base, categoryId: "x" })).toMatchObject({ ok: false });
    expect(cleanService({ ...base, price: "free?" })).toMatchObject({ ok: false });
    expect(cleanService({ ...base, active: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/how long/i) });
    expect(cleanService({ ...base, active: 30.5 })).toMatchObject({ ok: false });
    expect(cleanService({ ...base, active: 500, processing: 300 })).toMatchObject({ ok: false });
  });

  it("free services cost nothing whatever was typed; odd values fall back safely", () => {
    expect(cleanService({ ...base, priceType: "free", price: "junk" })).toMatchObject({ ok: true, value: { price_cents: 0 } });
    expect(cleanService({ ...base, stage: "nope", depositCategory: "gold" })).toMatchObject({ ok: true, value: { stage: "cut", deposit_category: "standard" } });
    // "book during processing" only means something when there is processing time
    expect(cleanService({ ...base, bookDuringProcessing: false })).toMatchObject({ ok: true, value: { allow_booking_in_processing: true } });
    expect(cleanService({ ...base, processing: 30, bookDuringProcessing: false })).toMatchObject({ ok: true, value: { allow_booking_in_processing: false } });
  });

  it("names groups and keys", () => {
    expect(cleanGroupName("  Color  ")).toEqual({ ok: true, name: "Color" });
    expect(cleanGroupName(" ")).toMatchObject({ ok: false });
    expect(uniqueKey("Women's Cut", [])).toBe("womens_cut");
    expect(uniqueKey("Women's Cut", ["womens_cut", "womens_cut_2"])).toBe("womens_cut_3");
    expect(uniqueKey("✂︎", [])).toBe("item");
  });

  it("moves items", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("works out who offers a service", () => {
    const all = ["s1", "s2", "s3"];
    const stylists = [
      { id: "everything", serviceIds: null },
      { id: "some", serviceIds: ["s1"] },
      { id: "has", serviceIds: ["s1", "s2"] },
    ];
    expect(offeredBy(stylists, "s2")).toEqual(["everything", "has"]);
    // nobody changes when the ticks match
    expect(offerChanges(stylists, all, "s2", ["everything", "has"])).toEqual([]);
    // add to "some", take away from "everything" and "has"
    expect(offerChanges(stylists, all, "s2", ["some"])).toEqual([
      { id: "everything", serviceIds: ["s1", "s3"] },
      { id: "some", serviceIds: ["s1", "s2"] },
      { id: "has", serviceIds: ["s1"] },
    ]);
  });
});

describe("stylists' own prices", () => {
  it("reads what was typed, only for stylists who offer it", () => {
    const r = cleanOwn({ a: { price: "45", active: "" }, b: { price: "", active: "60" }, c: { price: "99" } }, ["a", "b"]);
    expect(r).toEqual({ ok: true, value: { a: { price: 4500 }, b: { active: 60 } } });
    expect(cleanOwn({ a: { price: "lots" } }, ["a"])).toMatchObject({ ok: false });
    expect(cleanOwn({ a: { active: "0" } }, ["a"])).toMatchObject({ ok: false });
    expect(cleanOwn(null, ["a"])).toEqual({ ok: true, value: { a: {} } });
  });

  it("sets or clears one service in a stylist's list", () => {
    expect(withOwn({ x: { price: 1 } }, "y", { active: 30 })).toEqual({ x: { price: 1 }, y: { active: 30 } });
    expect(withOwn({ x: { price: 1 }, y: { active: 30 } }, "y", {})).toEqual({ x: { price: 1 } });
    expect(withOwn(null, "y", null)).toEqual({});
  });
});
