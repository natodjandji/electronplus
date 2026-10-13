import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LiveCatalogLookup } from "./cart-reconcile";
import { useElectronStore } from "./electron-store";
import { catalogQuery, toProduct } from "./product-api";

/** Checked against the whole active catalog the store already loads (and
 * usually already has cached) instead of one request per cart line. A
 * product missing from it is gone for a customer — unlisted products 404
 * and checkout refuses them. If the catalog can't load, this throws and
 * the cart stays exactly as it is. */
async function fetchLiveCatalog(
  queryClient: QueryClient,
  ids: string[],
): Promise<LiveCatalogLookup> {
  const { data } = await queryClient.fetchQuery(catalogQuery);
  const byId = new Map(data.map((product) => [product.id, product]));
  const lookup: LiveCatalogLookup = new Map();
  for (const id of ids) {
    const product = byId.get(id);
    lookup.set(id, product ? toProduct(product) : null);
  }
  return lookup;
}

/**
 * Cart lines are localStorage snapshots from add-to-cart time. Once per
 * visit, re-validates them against the live catalog so price/stock on screen
 * match what checkout will charge (the server re-prices regardless — this
 * just avoids a surprise), and tells the customer what changed.
 */
export function useCartCatalogSync() {
  const { cart, syncCartWithCatalog } = useElectronStore();
  const queryClient = useQueryClient();

  // The cart hydrates from localStorage after mount, so it starts empty:
  // capture the ids the first time it has items instead of on first render.
  const [idsToCheck, setIdsToCheck] = useState<string[] | null>(null);
  useEffect(() => {
    if (idsToCheck === null && cart.length > 0) {
      setIdsToCheck(cart.map((item) => item.product.id));
    }
  }, [cart, idsToCheck]);

  const { data: lookup } = useQuery({
    queryKey: ["cart-live-catalog", idsToCheck],
    queryFn: () => fetchLiveCatalog(queryClient, idsToCheck!),
    enabled: idsToCheck !== null,
    gcTime: 0,
    retry: false,
  });

  const appliedRef = useRef<LiveCatalogLookup | null>(null);
  useEffect(() => {
    if (!lookup || appliedRef.current === lookup) return;
    appliedRef.current = lookup;
    const { removed, qtyReduced, priceChanged } = syncCartWithCatalog(lookup);
    if (removed.length) toast.error(`Ya no disponible, quitado del carrito: ${removed.join(", ")}`);
    if (qtyReduced.length) toast(`Cantidad ajustada al stock disponible: ${qtyReduced.join(", ")}`);
    if (priceChanged.length) toast(`El precio cambió para: ${priceChanged.join(", ")}`);
  }, [lookup, syncCartWithCatalog]);
}
