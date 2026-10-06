import type { Product } from "./product";

export type CartItem = { product: Product; qty: number };

export interface CartSyncResult {
  removed: string[];
  priceChanged: string[];
  qtyReduced: string[];
}

/** product id -> its current catalog entry, or null when the catalog
 * CONFIRMED it no longer exists. An id absent from the map means "couldn't
 * check" (network error, etc.) — those lines are left exactly as they are,
 * since failing to verify is not evidence a product is gone. */
export type LiveCatalogLookup = Map<string, Product | null>;

/** Applies a catalog lookup to a cart — refreshes each line's snapshot,
 * clamps qty to live stock, and drops lines that are confirmed gone or out
 * of stock. */
export function reconcileCart(
  cart: CartItem[],
  live: LiveCatalogLookup,
): { next: CartItem[]; result: CartSyncResult } {
  const result: CartSyncResult = { removed: [], priceChanged: [], qtyReduced: [] };
  const next: CartItem[] = [];
  for (const item of cart) {
    const entry = live.get(item.product.id);
    if (entry === undefined) {
      next.push(item);
      continue;
    }
    if (entry === null || entry.stock <= 0) {
      result.removed.push(item.product.name);
      continue;
    }
    const qty = Math.min(item.qty, entry.stock);
    if (qty < item.qty) result.qtyReduced.push(entry.name);
    if (entry.retailPrice !== item.product.retailPrice) result.priceChanged.push(entry.name);
    next.push({ product: entry, qty });
  }
  return { next, result };
}
