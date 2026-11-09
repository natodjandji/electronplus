import { useQuery, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api-client";
import { fold } from "./product-search";

export interface SecondStoreProduct {
  id: string;
  name: string;
  code?: string;
  stock: number;
  retailPrice?: number;
  wholesalePrice?: number;
  linkedProductId?: string;
  linkedProduct: { id: string; sku: string; name: string; stock: number } | null;
  /** Set when Profit Plus stopped sending this (linked) record. */
  missingFromErpSince?: string | null;
  /** 'manual' when an admin created it; anything else came from Profit Plus. */
  source?: "erp" | "manual";
}

/** The secundaria's Profit Plus owns the description, code, stock and prices
 * of a record it brought: the sync would undo a change made here, and the
 * API refuses one. */
export function isFromSecondStoreErp(product: Pick<SecondStoreProduct, "source">): boolean {
  return product.source !== "manual";
}

export const SECOND_STORE_ERP_NOTE =
  "Viene del Profit Plus de la tienda secundaria: la descripción, el código, el stock y los precios se cambian allá y llegan solos con la sincronización.";

/** Whether a linked pair's prices (retail or wholesale) agree. */
export type PriceMatch = "same" | "different";

/**
 * How a price at the principal compares with the same price at its linked
 * secundaria record, to the cent. A price of 0 means there is none, so two
 * missing prices don't count as agreeing.
 */
export function comparePrices(
  mainPrice: number | undefined,
  secondPrice: number | undefined,
): PriceMatch {
  const main = Math.round((mainPrice ?? 0) * 100);
  const second = Math.round((secondPrice ?? 0) * 100);
  return main > 0 && main === second ? "same" : "different";
}

/** Letters and digits only: "T5/9W" and "t59w" are the same code. */
function codeKey(text: string): string {
  return fold(text).replace(/[^a-z0-9]/g, "");
}

/** How short a code can be and still match the start or end of a longer
 * one: below this, "12" would match half the catalog. */
const MIN_PARTIAL_CODE = 6;

function codeMatch(code: string, wanted: string[]): "exact" | "similar" | null {
  const key = codeKey(code);
  if (!key) return null;
  if (wanted.includes(key)) return "exact";
  const partial = wanted.some(
    (w) =>
      Math.min(w.length, key.length) >= MIN_PARTIAL_CODE &&
      (w.startsWith(key) || w.endsWith(key) || key.startsWith(w) || key.endsWith(w)),
  );
  return partial ? "similar" : null;
}

export interface LinkCandidate<T> {
  record: T;
  /** "exact": the same code, ignoring case and punctuation. "similar": one
   * code is the start or the end of the other. */
  codeMatch: "exact" | "similar" | null;
}

/**
 * The secundaria records a search in the link dialog finds, likeliest first.
 *
 * The secundaria's Profit Plus often writes the principal's code a little
 * differently: "T5/9W" as "T59W", or a barcode without its first digits
 * ("6925212312018" as "5212312018"). So records whose code matches the
 * query, or one of `extraCodes`, come first: "exact" ones, then "similar"
 * ones. After them come the records with every word of the query in their
 * name or code, in their original order. An empty query keeps every record.
 */
export function rankLinkCandidates<T extends Pick<SecondStoreProduct, "name" | "code">>(
  records: T[],
  query: string,
  extraCodes: string[] = [],
): LinkCandidate<T>[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return records.map((record) => ({ record, codeMatch: null }));
  const wanted = [query, ...extraCodes].map(codeKey).filter(Boolean);
  const rank = (c: LinkCandidate<T>) => (c.codeMatch === "exact" ? 0 : c.codeMatch ? 1 : 2);
  return (
    records
      .flatMap((record): LinkCandidate<T>[] => {
        const match = codeMatch(record.code ?? "", wanted);
        if (match) return [{ record, codeMatch: match }];
        const text = fold(`${record.name} ${record.code ?? ""}`);
        return words.every((w) => text.includes(w)) ? [{ record, codeMatch: null }] : [];
      })
      // A stable sort: ties keep the list's order.
      .sort((a, b) => rank(a) - rank(b))
  );
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
