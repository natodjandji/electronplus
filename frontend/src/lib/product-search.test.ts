import { describe, expect, it } from "vitest";
import { searchProducts } from "./product-search";

const products = [
  {
    name: "Aplique LED 15W 3000K Negro",
    sku: "7591996047191",
    model: "LED208-N",
    brand: "Lumistar",
  },
  { name: "Lámpara Lineal LED 36W 6500K 120cm", sku: "642896412798", model: "01-01-1097" },
  { name: "Vapoleta LED 2W 3000K", sku: "7590719015189", model: "1518", brand: "Lucerna" },
];

describe("searchProducts", () => {
  it("keeps every product for an empty query", () => {
    expect(searchProducts(products, "  ")).toEqual(products);
  });

  it("needs every word, in any order, ignoring case and accents", () => {
    expect(searchProducts(products, "15w aplique").map((p) => p.model)).toEqual(["LED208-N"]);
    expect(searchProducts(products, "LAMPARA lineal").map((p) => p.model)).toEqual(["01-01-1097"]);
    expect(searchProducts(products, "aplique 36w")).toEqual([]);
  });

  it("finds a product by SKU, barcode or brand", () => {
    expect(searchProducts(products, "led208").map((p) => p.model)).toEqual(["LED208-N"]);
    expect(searchProducts(products, "7590719015189").map((p) => p.model)).toEqual(["1518"]);
    expect(searchProducts(products, "lucerna").map((p) => p.model)).toEqual(["1518"]);
  });

  it("keeps the catalog's order", () => {
    expect(searchProducts(products, "led").map((p) => p.model)).toEqual([
      "LED208-N",
      "01-01-1097",
      "1518",
    ]);
  });
});
