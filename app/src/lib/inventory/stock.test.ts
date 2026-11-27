import { describe, expect, it } from "vitest";
import { catalogLines, containersUsed, productsFromCatalog, reorderList, stockLevel, supplyCheck, usageLabel, type Product, catalogItems, inInventory, searchCatalog } from "./stock";

const base: Product = {
  id: "", kind: "color", brand: "Redken", line: "Shades EQ Gloss", shade: null, name: "", size: 2, unit: "oz", barcode: null,
  saloncentricItem: null, cosmoprofItem: null, vendor: "saloncentric", costCents: 1150, priceCents: null, onHand: 0, minQty: null, maxQty: null, archived: false,
};
const p = (id: string, x: Partial<Product>): Product => ({ ...base, id, shade: id, name: id, ...x });

describe("stock levels and reordering", () => {
  it("flags out and low", () => {
    expect(stockLevel({ onHand: 0, minQty: null })).toBe("out");
    expect(stockLevel({ onHand: 1, minQty: 1 })).toBe("low");
    expect(stockLevel({ onHand: 2, minQty: 1 })).toBe("ok");
    expect(stockLevel({ onHand: 2, minQty: null })).toBe("untracked");
  });

  it("orders up to max, grouped by supplier with item numbers", () => {
    const list = reorderList([
      p("09V", { onHand: 0.5, minQty: 1, maxQty: 4, saloncentricItem: "SC-123" }),
      p("010N", { onHand: 1, minQty: 1, maxQty: null }),
      p("6N", { brand: "Kenra Professional", line: "Kenra Color Permanent", vendor: "cosmoprof", cosmoprofItem: "CP-9", onHand: 0, minQty: 2, maxQty: 3, costCents: 900 }),
      p("8N", { onHand: 3, minQty: 1, maxQty: 4 }), // fine
      p("7N", { onHand: 0, minQty: 1, maxQty: 2, archived: true }),
    ]);
    expect(list.map((g) => [g.vendor, g.lines.map((l) => [l.product.id, l.order, l.itemNumber]), g.costCents])).toEqual([
      ["saloncentric", [["09V", 4, "SC-123"], ["010N", 1, null]], 1150 * 5],
      ["cosmoprof", [["6N", 3, "CP-9"]], 2700],
    ]);
  });
});

describe("usage", () => {
  it("converts measured amounts to containers", () => {
    expect(containersUsed(1, "oz", { size: 2, unit: "oz" })).toBe(0.5);
    expect(containersUsed(30, "ml", { size: 60, unit: "ml" })).toBe(0.5);
    expect(containersUsed(60, "g", { size: 2, unit: "oz" })).toBeCloseTo(60 / 59.147);
    expect(containersUsed(1.5, "container", { size: null, unit: "oz" })).toBe(1.5);
    expect(containersUsed(1, "oz", { size: null, unit: "oz" })).toBeNull();
    expect(usageLabel(1.5)).toBe("1.5 tubes (150%)");
    expect(usageLabel(0.25, "developer")).toBe("0.25 bottles (25%)");
  });

  it("warns when the last visit used more than is on hand", () => {
    const products = new Map([["6N", p("6N", { onHand: 1 })], ["9V", p("9V", { onHand: 3 })]]);
    const w = supplyCheck([{ productId: "6N", containers: 1 }, { productId: "6N", containers: 0.5 }, { productId: "9V", containers: 1 }], products);
    expect(w.map((x) => [x.product.id, x.needed])).toEqual([["6N", 1.5]]);
  });
});

describe("catalog", () => {
  it("turns chosen shades into products", () => {
    const eq = catalogLines().find((l) => l.line === "Shades EQ")!;
    const rows = productsFromCatalog(eq, [{ code: "09V", type: "gloss" }, { code: "nope" }], { size: 2, unit: "oz", vendor: "saloncentric", minQty: 1, maxQty: 3, costCents: null });
    expect(rows).toEqual([{ kind: "color", brand: "Redken", line: "Shades EQ Gloss", shade: "09V", name: "09V Platinum Ice", size: 2, unit: "oz", vendor: "saloncentric", min_qty: 1, max_qty: 3, cost_cents: null }]);
    expect(catalogLines().find((l) => l.line === "Kenra Simply Blonde")!.kind).toBe("lightener");
  });
});

describe("catalog search", () => {
  const items = catalogItems();
  it("finds a shade code first, across lines and kinds", () => {
    const r = searchCatalog(items, "6N");
    expect(r[0].code).toBe("6N");
    expect(r.every((i) => /6N/i.test(`${i.code} ${i.name ?? ""}`) || i.lineLabel.includes("6N"))).toBe(true);
    expect(new Set(r.filter((i) => i.code === "6N").map((i) => i.lineLabel)).size).toBeGreaterThan(1);
  });
  it("narrows with more words", () => {
    const r = searchCatalog(items, "shades eq 09v");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => i.lineLabel.includes("Shades EQ") && i.code.startsWith("09V"))).toBe(true);
    expect(r[0].code).toBe("09V");
    expect(searchCatalog(items, "  ")).toEqual([]);
  });
  it("knows what's already in inventory", () => {
    const i = searchCatalog(items, "kenra color permanent 6N")[0];
    expect(inInventory(i, [{ brand: i.brand, line: `${i.line} Permanent`, shade: "6n", archived: false }])).toBe(true);
    expect(inInventory(i, [{ brand: i.brand, line: `${i.line} Demi`, shade: "6N", archived: false }])).toBe(false);
  });
});
