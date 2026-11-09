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

/**
 * The products that have every word of the query in their name, SKU,
 * barcode or brand, in their original order: "aplique 15w" finds
 * "Aplique LED 15W 3000K". An empty query keeps them all.
 */
export function searchProducts<T extends SearchableProduct>(products: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return products;
  return products.filter((p) => {
    const text = fold(`${p.name} ${p.model ?? ""} ${p.sku} ${p.brand ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}
