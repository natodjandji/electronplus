/** What a product search looks in. */
export interface SearchableProduct {
  name: string;
  sku: string;
  /** The store's SKU. */
  model?: string | null;
  brand?: string | null;
}

/** Lowercase and without accents, so "lampara" finds "Lámpara". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** The query's words, as `fold` leaves them. */
function queryWords(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

/**
 * Whether the fields hold every word of the query between them, in any
 * order and ignoring case and accents: "18w panel" finds "Panel LED 18W",
 * and "lucerna panel" an order from Lucerna with a panel in it. An empty
 * query matches anything.
 */
export function matchesWords(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = queryWords(query);
  if (words.length === 0) return true;
  const text = fold(fields.filter(Boolean).join(" "));
  return words.every((word) => text.includes(word));
}

/**
 * The products that have every word of the query in their name, SKU,
 * barcode or brand, in their original order: "15w aplique" finds
 * "Aplique LED 15W 3000K". An empty query keeps them all.
 */
export function searchProducts<T extends SearchableProduct>(products: T[], query: string): T[] {
  if (queryWords(query).length === 0) return products;
  return products.filter((p) => matchesWords(query, p.name, p.model, p.sku, p.brand));
}
