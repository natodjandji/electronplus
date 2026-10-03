import { useQuery, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api-client";

export interface SecondStoreProduct {
  id: string;
  name: string;
  code?: string;
  stock: number;
  retailPrice?: number;
  wholesalePrice?: number;
  linkedProductId?: string;
  linkedProduct: { id: string; sku: string; name: string; stock: number } | null;
}

export const SECOND_STORE_PRODUCTS_KEY = ["admin", "second-store-products"] as const;

/**
 * The secundaria store's whole list (thousands of rows), shared by the
 * "Tienda secundaria" page and the link dialog in Inventario — whichever
 * loads first primes the other. Every edit invalidates it explicitly and the
 * bridge sync only runs every half hour, so it doesn't refetch on its own
 * each time the admin tab regains focus.
 */
export function useSecondStoreProducts() {
  return useQuery({
    queryKey: SECOND_STORE_PRODUCTS_KEY,
    queryFn: () => apiFetch<SecondStoreProduct[]>("/second-store-products"),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Folds one saved row (what the API answers a write with) into the cached
 * list, instead of invalidating it — a refetch would re-download thousands of
 * rows to show a single change. `linkedProduct` is passed when the write
 * changed the link (the API row only carries `linkedProductId`).
 */
export function applySecondStoreRow(
  queryClient: QueryClient,
  saved: Partial<SecondStoreProduct> & { id: string },
  linkedProduct?: SecondStoreProduct["linkedProduct"],
) {
  queryClient.setQueryData<SecondStoreProduct[]>(SECOND_STORE_PRODUCTS_KEY, (list) => {
    if (!list) return list;
    const previous = list.find((p) => p.id === saved.id);
    const next = {
      linkedProduct: null,
      ...previous,
      ...saved,
      ...(linkedProduct !== undefined ? { linkedProduct } : {}),
    } as SecondStoreProduct;
    return previous ? list.map((p) => (p.id === saved.id ? next : p)) : [...list, next];
  });
}
