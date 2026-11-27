import { describe, expect, it } from "vitest";
import { asDoneBy, cleanOwnPrices, toStylists, type StaffRow } from "./stylists";

const ID = "00000000-0000-4000-8000-000000000001";
const row = (over: Partial<StaffRow>): StaffRow => ({ id: "k", display_name: "Karissa", role: "owner", color: null, hours: null, service_ids: null, bookable: true, title: null, sort: 0, active: true, ...over });

describe("stylists' own prices", () => {
  it("cleans stored values", () => {
    expect(cleanOwnPrices({ [ID]: { price: 4500, active: 60 }, nope: { price: 1 }, [ID.replace("1", "2")]: { price: -5, active: 9999 } })).toEqual({ [ID]: { price: 4500, active: 60 } });
    expect(cleanOwnPrices("junk")).toEqual({});
  });

  it("only apply when the salon has the option on", () => {
    const prices = { [ID]: { price: 4500 } };
    expect(toStylists([row({ service_prices: prices, businesses: { stylist_pricing: true } })])[0].own).toEqual(prices);
    expect(toStylists([row({ service_prices: prices, businesses: { stylist_pricing: false } })])[0].own).toEqual({});
    expect(toStylists([row({ service_prices: prices })])[0].own).toEqual({});
  });

  it("changes price and working time, nothing else", () => {
    const svc = [{ id: ID, price: 35, active: 45, processing: 20, name: "Cut" }, { id: "other", price: 10, active: 15, processing: 0, name: "Fee" }];
    expect(asDoneBy(svc, { own: { [ID]: { price: 4500, active: 60 } } })).toEqual([{ id: ID, price: 45, active: 60, processing: 20, name: "Cut" }, svc[1]]);
    expect(asDoneBy(svc, { own: { [ID]: { active: 30 } } })[0]).toMatchObject({ price: 35, active: 30 });
    expect(asDoneBy(svc, null)).toBe(svc);
  });
});
