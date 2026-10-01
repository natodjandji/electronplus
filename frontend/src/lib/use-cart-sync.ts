import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiFetch } from "./api-client";
import { useElectronStore, type LiveCatalogLookup } from "./electron-store";
import { type ApiProduct, toProduct } from "./product-api";

/** One request per cart line (carts are small) rather than scanning the
 * catalog list: that list is paginated, so a product beyond its first page
 * would look "missing" and get wrongly dropped. A 404 is the only proof a
 * product is gone; any other failure leaves that line out of the lookup so
 * it stays untouched. */
async function fetchLiveCatalog(ids: string[]): Promise<LiveCatalogLookup> {
  const settled = await Promise.allSettled(
    ids.map((id) => apiFetch<ApiProduct>(`/products/${encodeURIComponent(id)}`)),
  );
  const lookup: LiveCatalogLookup = new Map();
  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      lookup.set(ids[i], toProduct(outcome.value));
    } else if (outcome.reason instanceof ApiError && outcome.reason.status === 404) {
      lookup.set(ids[i], null);
    }
  });
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
    queryFn: () => fetchLiveCatalog(idsToCheck!),
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
