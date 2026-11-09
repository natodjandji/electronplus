import { describe, expect, it } from "vitest";
import {
  facetCounts,
  hasFilters,
  matchesFilters,
  NO_FILTERS,
  NO_SUPPLIER,
  type InventoryRow,
} from "./inventory-filters";

const row = (id: string, overrides: Partial<InventoryRow<string>> = {}): InventoryRow<string> => ({
  product: id,
  text: id,
  categoryId: "paneles",
  supplierId: "lucerna",
  linked: true,
  wholesale: "same",
  retail: "different",
  ...overrides,
});

const rows = [
  row("a", { text: "panel led 18w 6925212312018" }),
  row("b", { categoryId: "apliques", wholesale: "different" }),
  row("c", { supplierId: "vert", retail: "same" }),
  row("d", { linked: false, wholesale: null, retail: null, supplierId: undefined }),
];
const pass = (filters: Partial<typeof NO_FILTERS>) =>
  rows.filter((r) => matchesFilters(r, { ...NO_FILTERS, ...filters })).map((r) => r.product);

describe("matchesFilters", () => {
  it("keeps everything with no filters", () => {
    expect(pass({})).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by category, supplier, or a missing supplier", () => {
    expect(pass({ category: "apliques" })).toEqual(["b"]);
    expect(pass({ supplier: "vert" })).toEqual(["c"]);
    expect(pass({ supplier: NO_SUPPLIER })).toEqual(["d"]);
  });

  it("compares prices only for linked products", () => {
    expect(pass({ wholesale: "same" })).toEqual(["a", "c"]);
    expect(pass({ wholesale: "different" })).toEqual(["b"]);
    expect(pass({ retail: "same" })).toEqual(["c"]);
    expect(pass({ retail: "different" })).toEqual(["a", "b"]);
  });

  it("combines filters and the search", () => {
    expect(pass({ category: "paneles", wholesale: "same", supplier: "lucerna" })).toEqual(["a"]);
    expect(pass({ search: "PANEL 18W" })).toEqual(["a"]);
    expect(pass({ search: "panel", category: "apliques" })).toEqual([]);
    expect(pass({ onlyUnlinked: true })).toEqual(["d"]);
  });

  it("can leave one filter out", () => {
    expect(matchesFilters(rows[1], { ...NO_FILTERS, category: "paneles" }, "category")).toBe(true);
  });
});

describe("facetCounts", () => {
  it("counts each value under the other filters", () => {
    expect(facetCounts(rows, NO_FILTERS, "wholesale")).toEqual(
      new Map([
        ["same", 2],
        ["different", 1],
      ]),
    );
    // Picking a category narrows the price counts...
    expect(facetCounts(rows, { ...NO_FILTERS, category: "paneles" }, "wholesale")).toEqual(
      new Map([["same", 2]]),
    );
    // ...but not its own: every category still shows what it would leave.
    expect(facetCounts(rows, { ...NO_FILTERS, category: "paneles" }, "category")).toEqual(
      new Map([
        ["paneles", 3],
        ["apliques", 1],
      ]),
    );
  });

  it("counts a product with no supplier under NO_SUPPLIER", () => {
    expect(facetCounts(rows, NO_FILTERS, "supplier").get(NO_SUPPLIER)).toBe(1);
  });
});

describe("hasFilters", () => {
  it("is false only with every filter off", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, search: "  " })).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, retail: "same" })).toBe(true);
    expect(hasFilters({ ...NO_FILTERS, onlyUnlinked: true })).toBe(true);
  });
});
