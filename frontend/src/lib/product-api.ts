import { apiFetch } from "./api-client";
import type { Product } from "./mock-data";

export interface ApiProduct {
  id: string;
  sku: string;
  name: string;
  specs?: string;
  category: { id: string; code: string; label: string };
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  imageUrl?: string;
  thumbnailUrl?: string;
}

export function toProduct(p: ApiProduct): Product {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category.code,
    categoryLabel: p.category.label,
    retailPrice: p.retailPrice,
    wholesalePrice: p.wholesalePrice,
    stock: p.stock,
    warehouse: "",
    image: p.imageUrl ?? "",
    thumbnail: p.thumbnailUrl ?? p.imageUrl ?? "",
    specs: p.specs ?? "",
  };
}

/**
 * The whole active catalog in one response, shared by the catalog,
 * collections, quote builder and chat assistant — whichever loads first
 * primes the others (each applies its own `select`). The backend serves it
 * from memory and gzips it, so it scales to the full Profit Plus catalog
 * instead of the first 100 products alphabetically.
 */
export const catalogQuery = {
  queryKey: ["products", "catalog"],
  queryFn: () => apiFetch<{ data: ApiProduct[] }>("/products/catalog"),
  // The catalog changes when stock moves, not by the second — and the
  // product page re-reads the live product before anything is bought.
  staleTime: 5 * 60 * 1000,
} as const;
