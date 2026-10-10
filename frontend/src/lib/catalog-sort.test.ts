import { describe, expect, it } from "vitest";
import { isCatalogSort, sortCatalog } from "./catalog-sort";
import type { Product } from "./product";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: overrides.sku ?? "p1",
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

const retail = (p: Product) => p.retailPrice;
const skus = (list: Product[]) => list.map((p) => p.sku);

describe("sortCatalog", () => {
  const catalog = [
    product({ sku: "B", name: "Breaker 20A", retailPrice: 12 }),
    product({ sku: "A", name: "Bombillo LED 9W", retailPrice: 2.5 }),
    product({ sku: "C", name: "Cable THHN 12 AWG", retailPrice: 40 }),
  ];

  it("orders by price both ways", () => {
    expect(skus(sortCatalog(catalog, "price-asc", retail))).toEqual(["A", "B", "C"]);
    expect(skus(sortCatalog(catalog, "price-desc", retail))).toEqual(["C", "B", "A"]);
  });

  it("keeps products without a price last in either price order", () => {
    const list = [...catalog, product({ sku: "Z", name: "Tablero", retailPrice: 0 })];
    expect(sortCatalog(list, "price-asc", retail).at(-1)?.sku).toBe("Z");
    expect(sortCatalog(list, "price-desc", retail).at(-1)?.sku).toBe("Z");
  });

  it("orders by name, comparing numbers as numbers and ignoring case and accents", () => {
    const list = [
      product({ sku: "1", name: "cable 12 AWG" }),
      product({ sku: "2", name: "Cable 8 AWG" }),
      product({ sku: "3", name: "Ácido" }),
    ];
    expect(skus(sortCatalog(list, "name-asc", retail))).toEqual(["3", "2", "1"]);
    expect(skus(sortCatalog(list, "name-desc", retail))).toEqual(["1", "2", "3"]);
  });

  it("puts products in stock first when nothing is searched", () => {
    const list = [
      product({ sku: "A", name: "Apagador", stock: 0 }),
      product({ sku: "B", name: "Breaker", stock: 4 }),
    ];
    expect(skus(sortCatalog(list, "relevance", retail))).toEqual(["B", "A"]);
  });

  it("ranks an exact code, then a name that starts with the search, then a word match", () => {
    const list = [
      product({ sku: "X1", name: "Tomacorriente doble con cable" }),
      product({ sku: "X2", name: "Extensión de cable" }),
      product({ sku: "X3", name: "Cable THHN 12" }),
      product({ sku: "CABLE", name: "Rollo", stock: 0 }),
      product({ sku: "X4", name: "Multicable" }),
    ];
    expect(skus(sortCatalog(list, "relevance", retail, " Cable "))).toEqual([
      "CABLE",
      "X3",
      "X2",
      "X1",
      "X4",
    ]);
  });

  it("does not reorder the list it was given", () => {
    const before = skus(catalog);
    sortCatalog(catalog, "price-desc", retail);
    expect(skus(catalog)).toEqual(before);
  });
});

describe("isCatalogSort", () => {
  it("accepts the known orders only", () => {
    expect(isCatalogSort("price-asc")).toBe(true);
    expect(isCatalogSort("popular")).toBe(false);
    expect(isCatalogSort(undefined)).toBe(false);
  });
});
