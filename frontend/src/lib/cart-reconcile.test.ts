import { describe, expect, it } from "vitest";
import { reconcileCart, type CartItem, type LiveCatalogLookup } from "./cart-reconcile";
import type { Product } from "./product";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    sku: "SKU-1",
    name: "Cable 12 AWG",
    category: "cables",
    retailPrice: 10,
    wholesalePrice: 8,
    stock: 20,
    warehouse: "",
    image: "",
    thumbnail: "",
    specs: "",
    ...overrides,
  } as Product;
}

const line = (p: Product, qty: number): CartItem => ({ product: p, qty });

describe("reconcileCart", () => {
  it("leaves a line untouched when the catalog couldn't be checked (id absent from the lookup)", () => {
    const item = line(product(), 3);
    const { next, result } = reconcileCart([item], new Map());
    expect(next).toEqual([item]);
    expect(result).toEqual({ removed: [], priceChanged: [], qtyReduced: [] });
  });

  it("removes a line the catalog confirmed no longer exists (null)", () => {
    const live: LiveCatalogLookup = new Map([["p1", null]]);
    const { next, result } = reconcileCart([line(product(), 2)], live);
    expect(next).toEqual([]);
    expect(result.removed).toEqual(["Cable 12 AWG"]);
  });

  it("removes a line whose live stock is 0", () => {
    const live: LiveCatalogLookup = new Map([["p1", product({ stock: 0 })]]);
    const { next, result } = reconcileCart([line(product(), 2)], live);
    expect(next).toEqual([]);
    expect(result.removed).toEqual(["Cable 12 AWG"]);
  });

  it("clamps quantity to live stock and reports it", () => {
    const live: LiveCatalogLookup = new Map([["p1", product({ stock: 2 })]]);
    const { next, result } = reconcileCart([line(product(), 5)], live);
    expect(next[0].qty).toBe(2);
    expect(result.qtyReduced).toEqual(["Cable 12 AWG"]);
    expect(result.removed).toEqual([]);
  });

  it("refreshes the snapshot and reports a price change", () => {
    const fresh = product({ retailPrice: 12 });
    const { next, result } = reconcileCart([line(product(), 1)], new Map([["p1", fresh]]));
    expect(next[0].product.retailPrice).toBe(12);
    expect(result.priceChanged).toEqual(["Cable 12 AWG"]);
  });

  it("refreshes silently when nothing meaningful changed", () => {
    const { next, result } = reconcileCart([line(product(), 4)], new Map([["p1", product()]]));
    expect(next[0].qty).toBe(4);
    expect(result).toEqual({ removed: [], priceChanged: [], qtyReduced: [] });
  });

  it("handles a mixed cart line by line and preserves order", () => {
    const a = line(product({ id: "a", name: "A" }), 1);
    const b = line(product({ id: "b", name: "B" }), 1);
    const c = line(product({ id: "c", name: "C" }), 1);
    const live: LiveCatalogLookup = new Map([
      ["a", product({ id: "a", name: "A", retailPrice: 99 })],
      ["b", null],
    ]);
    const { next, result } = reconcileCart([a, b, c], live);
    expect(next.map((i) => i.product.id)).toEqual(["a", "c"]);
    expect(next[1]).toBe(c);
    expect(result).toEqual({ removed: ["B"], priceChanged: ["A"], qtyReduced: [] });
  });

  it("does not mutate the cart it was given", () => {
    const cart = [line(product(), 5)];
    reconcileCart(cart, new Map([["p1", product({ stock: 1 })]]));
    expect(cart[0].qty).toBe(5);
  });
});
