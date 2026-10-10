import type { Product } from "./product";

export const CATALOG_SORTS = [
  { id: "relevance", label: "Relevancia" },
  { id: "price-asc", label: "Precio: menor a mayor" },
  { id: "price-desc", label: "Precio: mayor a menor" },
  { id: "name-asc", label: "Nombre: A–Z" },
  { id: "name-desc", label: "Nombre: Z–A" },
] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number]["id"];

export const DEFAULT_CATALOG_SORT: CatalogSort = "relevance";

export function isCatalogSort(value: unknown): value is CatalogSort {
  return CATALOG_SORTS.some((s) => s.id === value);
}

// numeric: "Cable 10 AWG" before "Cable 12 AWG" before "Cable 8 AWG" reads
// wrong to anyone buying wire — compare the gauges as numbers.
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

const byName = (a: Product, b: Product) => collator.compare(a.name, b.name);

/** Sold-out products sink below the ones that can be bought. */
const byAvailability = (a: Product, b: Product) => Number(a.stock <= 0) - Number(b.stock <= 0);

/** How closely a product matches the search box: an exact code first, then
 * names or codes that start with it, then a word inside the name, then
 * anything else that merely contains it. Lower is better. */
function matchRank(p: Product, needle: string): number {
  const sku = p.sku.toLowerCase();
  const name = p.name.toLowerCase();
  if (sku === needle) return 0;
  if (name.startsWith(needle) || sku.startsWith(needle)) return 1;
  if (name.split(/[\s\-/(),.]+/).some((word) => word.startsWith(needle))) return 2;
  return 3;
}

/**
 * Orders an already-filtered catalog. `search` is the search box text: with
 * it, "relevancia" puts the closest matches first; without it, products in
 * stock before sold-out ones, each by name. A product with no price yet
 * goes last in either price order instead of passing as the cheapest.
 */
export function sortCatalog(
  products: readonly Product[],
  sort: CatalogSort,
  priceFor: (p: Product) => number,
  search = "",
): Product[] {
  const sorted = [...products];
  switch (sort) {
    case "price-asc":
    case "price-desc": {
      const dir = sort === "price-asc" ? 1 : -1;
      return sorted.sort((a, b) => {
        const pa = priceFor(a);
        const pb = priceFor(b);
        const unpriced = Number(pa <= 0) - Number(pb <= 0);
        return unpriced || dir * (pa - pb) || byName(a, b);
      });
    }
    case "name-asc":
      return sorted.sort(byName);
    case "name-desc":
      return sorted.sort((a, b) => byName(b, a));
    case "relevance": {
      const needle = search.trim().toLowerCase();
      if (!needle) return sorted.sort((a, b) => byAvailability(a, b) || byName(a, b));
      const rank = new Map(sorted.map((p) => [p.id, matchRank(p, needle)]));
      return sorted.sort(
        (a, b) => rank.get(a.id)! - rank.get(b.id)! || byAvailability(a, b) || byName(a, b),
      );
    }
  }
}
