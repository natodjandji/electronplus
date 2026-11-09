import { fold } from "./product-search";
import type { PriceMatch } from "./second-store";

/** Any value: the filter is off. */
export const ANY = "all";
/** The supplier filter's value for products with none assigned. */
export const NO_SUPPLIER = "none";

export type PriceFilter = typeof ANY | PriceMatch;

export interface InventoryFilters {
  search: string;
  /** Only products not linked to the secundaria yet. */
  onlyUnlinked: boolean;
  /** A category id, or ANY. */
  category: string;
  /** A supplier id, NO_SUPPLIER, or ANY. */
  supplier: string;
  wholesale: PriceFilter;
  retail: PriceFilter;
}

export const NO_FILTERS: InventoryFilters = {
  search: "",
  onlyUnlinked: false,
  category: ANY,
  supplier: ANY,
  wholesale: ANY,
  retail: ANY,
};

/** What the filters look at in one product. */
export interface InventoryRow<T> {
  product: T;
  /** Name, SKU and barcode, as `fold` leaves them. */
  text: string;
  categoryId: string;
  supplierId?: string | null;
  linked: boolean;
  /** How its prices compare with the secundaria's; null when it isn't
   * linked, so there's nothing to compare with. */
  wholesale: PriceMatch | null;
  retail: PriceMatch | null;
}

/** The filters that offer a choice of values, each with a count. */
export type Facet = "category" | "supplier" | "wholesale" | "retail";

function facetValue<T>(row: InventoryRow<T>, facet: Facet): string | null {
  switch (facet) {
    case "category":
      return row.categoryId;
    case "supplier":
      return row.supplierId || NO_SUPPLIER;
    case "wholesale":
      return row.wholesale;
    case "retail":
      return row.retail;
  }
}

const FACETS: Facet[] = ["category", "supplier", "wholesale", "retail"];

/** Whether a row passes every filter, leaving out `ignore` if given. */
export function matchesFilters<T>(
  row: InventoryRow<T>,
  filters: InventoryFilters,
  ignore?: Facet,
): boolean {
  if (filters.onlyUnlinked && row.linked) return false;
  for (const facet of FACETS) {
    if (facet === ignore || filters[facet] === ANY) continue;
    if (facetValue(row, facet) !== filters[facet]) return false;
  }
  const words = fold(filters.search).split(/\s+/).filter(Boolean);
  return words.every((word) => row.text.includes(word));
}

/**
 * How many rows each value of `facet` would leave, given the other filters
 * as they are: with a category picked, the price counts are that
 * category's. Rows with no value for it (an unlinked product has no price
 * comparison) aren't counted.
 */
export function facetCounts<T>(
  rows: InventoryRow<T>[],
  filters: InventoryFilters,
  facet: Facet,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = facetValue(row, facet);
    if (value === null || !matchesFilters(row, filters, facet)) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Whether anything narrows the list. */
export function hasFilters(filters: InventoryFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.onlyUnlinked ||
    FACETS.some((facet) => filters[facet] !== ANY)
  );
}
