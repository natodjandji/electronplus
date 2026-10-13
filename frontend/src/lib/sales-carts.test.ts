import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "./product";
import {
  computeCartTotals,
  createQtyDebouncer,
  findScannedProduct,
  parseScannedCode,
  whatsappShareHref,
} from "./sales-carts";

function product(id: string, sku: string): Product {
  return {
    id,
    sku,
    name: id,
    category: "x",
    retailPrice: 1,
    wholesalePrice: 1,
    stock: 1,
    warehouse: "",
    image: "",
    thumbnail: "",
    specs: "",
  };
}

describe("parseScannedCode", () => {
  it("reads the product id from a label's QR link", () => {
    expect(parseScannedCode("https://electronplus.com.ve/product/qr/breaker-20a")).toEqual({
      productId: "breaker-20a",
    });
    expect(parseScannedCode("https://electronplus-ve.web.app/product/cable-12/")).toEqual({
      productId: "cable-12",
    });
  });

  it("takes anything else as a SKU, and ignores unrelated links", () => {
    expect(parseScannedCode("  EP-LED-9W \n")).toEqual({ sku: "EP-LED-9W" });
    expect(parseScannedCode("https://instagram.com/electronplus")).toBeNull();
    expect(parseScannedCode("   ")).toBeNull();
  });
});

describe("findScannedProduct", () => {
  const a = product("breaker-20a", "BRK-20");
  const catalog = { byId: new Map([[a.id, a]]), bySku: new Map([[a.sku, a]]) };

  it("finds a product by QR link or by SKU in any case", () => {
    expect(findScannedProduct("https://electronplus.com.ve/product/qr/breaker-20a", catalog)).toBe(
      a,
    );
    expect(findScannedProduct("brk-20", catalog)).toBe(a);
    expect(findScannedProduct("NOPE", catalog)).toBeUndefined();
  });
});

describe("computeCartTotals", () => {
  it("applies the discount before 16% IVA, on the chosen price list", () => {
    const items = [
      { productId: "a", sku: "A", name: "A", qty: 3, retailPrice: 10, wholesalePrice: 8 },
      { productId: "b", sku: "B", name: "B", qty: 4, retailPrice: 2.5, wholesalePrice: 2 },
    ];
    expect(computeCartTotals({ items, priceList: "retail", discountPct: 10 })).toEqual({
      subtotal: 40,
      discountAmount: 4,
      taxableBase: 36,
      taxAmount: 5.76,
      total: 41.76,
    });
    expect(computeCartTotals({ items, priceList: "wholesale", discountPct: 0 }).subtotal).toBe(32);
  });
});

describe("whatsappShareHref", () => {
  it("goes to the customer's chat when the phone is usable", () => {
    expect(whatsappShareHref("Hola", "0414-123.4567")).toBe("https://wa.me/584141234567?text=Hola");
    expect(whatsappShareHref("Hola", "+58 414 1234567")).toBe(
      "https://wa.me/584141234567?text=Hola",
    );
    expect(whatsappShareHref("Hola mundo")).toBe("https://wa.me/?text=Hola%20mundo");
  });
});

describe("createQtyDebouncer", () => {
  afterEach(() => vi.useRealTimers());

  it("sends only the quantity a line settles on", () => {
    vi.useFakeTimers();
    const sent: [string, number][] = [];
    const qty = createQtyDebouncer((id, n) => sent.push([id, n]), 400);
    qty.set("a", 2);
    vi.advanceTimersByTime(300);
    qty.set("a", 3);
    qty.set("b", 5);
    qty.set("a", 4);
    expect(qty.waiting).toBe(true);
    vi.advanceTimersByTime(399);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([
      ["b", 5],
      ["a", 4],
    ]);
    expect(qty.waiting).toBe(false);
  });

  it("sends what is waiting at once on flush, and nothing twice", () => {
    vi.useFakeTimers();
    const sent: [string, number][] = [];
    const qty = createQtyDebouncer((id, n) => sent.push([id, n]), 400);
    qty.set("a", 2);
    qty.set("b", 0);
    qty.flush();
    expect(sent).toEqual([
      ["a", 2],
      ["b", 0],
    ]);
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(2);
    qty.flush();
    expect(sent).toHaveLength(2);
  });
});
