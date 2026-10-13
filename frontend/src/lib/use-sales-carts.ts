import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, apiFetch, reportError } from "./api-client";
import type { Product } from "./product";
import {
  salesCartKey,
  salesCartListKey,
  type PriceList,
  type SalesCart,
  type SalesCartCustomer,
  type SharedQuoteLink,
} from "./sales-carts";

/** The shared quote as a letter-size PDF, built by the server — what
 * "Imprimir" opens and the customer downloads. */
export const quotePdfUrl = (token: string) =>
  `${API_BASE_URL}/shared-quotes/${encodeURIComponent(token)}/pdf`;

export function useSalesCartList(status: "open" | "completed") {
  return useQuery({
    queryKey: salesCartListKey(status),
    queryFn: () => apiFetch<SalesCart[]>(`/sales-carts?status=${status}`),
  });
}

/** The second store's stock per linked product (product id → units) —
 * for the seller's screen only; the shared quote never carries stock. */
export function useSecondStoreStock(enabled = true) {
  return useQuery({
    queryKey: ["sales-carts", "second-store-stock"],
    queryFn: () => apiFetch<Record<string, number>>("/sales-carts/second-store-stock"),
    staleTime: 60_000,
    enabled,
  });
}

export function useSalesCart(id: string) {
  return useQuery({
    queryKey: salesCartKey(id),
    queryFn: () => apiFetch<SalesCart>(`/sales-carts/${id}`),
  });
}

export function useCreateSalesCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<SalesCart>("/sales-carts", { method: "POST", body: {} }),
    onSuccess: (cart) => {
      queryClient.setQueryData(salesCartKey(cart.id), cart);
      void queryClient.invalidateQueries({ queryKey: ["sales-carts", "list"] });
    },
    onError: reportError,
  });
}

type CartChange =
  | { kind: "add"; product: Product; qty: number }
  | { kind: "qty"; productId: string; qty: number }
  | {
      kind: "update";
      patch: { customer?: SalesCartCustomer; priceList?: PriceList; discountPct?: number };
    };

/** The cart as it will be once the server applies the change — shown at
 * once, so a scan feels instant on the shop floor's patchy Wi-Fi. */
function applyChange(cart: SalesCart, change: CartChange): SalesCart {
  switch (change.kind) {
    case "add": {
      const { product, qty } = change;
      const existing = cart.items.find((i) => i.productId === product.id);
      return {
        ...cart,
        items: existing
          ? cart.items.map((i) => (i.productId === product.id ? { ...i, qty: i.qty + qty } : i))
          : [
              ...cart.items,
              {
                productId: product.id,
                sku: product.sku,
                name: product.name,
                qty,
                retailPrice: product.retailPrice,
                wholesalePrice: product.wholesalePrice,
              },
            ],
      };
    }
    case "qty":
      return {
        ...cart,
        items:
          change.qty === 0
            ? cart.items.filter((i) => i.productId !== change.productId)
            : cart.items.map((i) =>
                i.productId === change.productId ? { ...i, qty: change.qty } : i,
              ),
      };
    case "update":
      return { ...cart, ...change.patch };
  }
}

function requestFor(cartId: string, change: CartChange) {
  switch (change.kind) {
    case "add":
      return apiFetch<SalesCart>(`/sales-carts/${cartId}/items`, {
        method: "POST",
        body: { productId: change.product.id, qty: change.qty },
      });
    case "qty":
      return apiFetch<SalesCart>(
        `/sales-carts/${cartId}/items/${encodeURIComponent(change.productId)}`,
        { method: "PATCH", body: { qty: change.qty } },
      );
    case "update":
      return apiFetch<SalesCart>(`/sales-carts/${cartId}`, { method: "PATCH", body: change.patch });
  }
}

/**
 * Every edit to one cart, applied to the screen at once and sent to the
 * server one at a time (mutation scope), so quick scans arrive in order.
 * The server's copy replaces the local one only once nothing else is
 * queued — an earlier reply would briefly undo the scans still in flight.
 */
export function useSalesCartActions(cartId: string) {
  const queryClient = useQueryClient();
  const key = salesCartKey(cartId);
  const writeKey = ["sales-carts", "write", cartId];

  const change = useMutation({
    mutationKey: writeKey,
    scope: { id: `sales-cart:${cartId}` },
    mutationFn: (c: CartChange) => requestFor(cartId, c),
    onSuccess: (cart) => {
      if (queryClient.isMutating({ mutationKey: writeKey }) <= 1) {
        queryClient.setQueryData(key, cart);
      }
    },
    onError: (error) => {
      reportError(error);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const share = useMutation({
    mutationKey: writeKey,
    scope: { id: `sales-cart:${cartId}` },
    mutationFn: () => apiFetch<SharedQuoteLink>(`/sales-carts/${cartId}/share`, { method: "POST" }),
    onSuccess: (link) => {
      queryClient.setQueryData<SalesCart>(key, (cart) =>
        cart ? { ...cart, quoteToken: link.token, quoteNumber: link.number } : cart,
      );
    },
    onError: reportError,
  });

  const complete = useMutation({
    mutationKey: writeKey,
    scope: { id: `sales-cart:${cartId}` },
    mutationFn: (invoiceRef?: string) =>
      apiFetch<SalesCart>(`/sales-carts/${cartId}/complete`, {
        method: "POST",
        body: { invoiceRef },
      }),
    onSuccess: (cart) => {
      queryClient.setQueryData(key, cart);
      void queryClient.invalidateQueries({ queryKey: ["sales-carts", "list"] });
    },
    onError: reportError,
  });

  /** Cancelling deletes the cart on the server — nothing of it is kept. */
  const cancel = useMutation({
    mutationKey: writeKey,
    scope: { id: `sales-cart:${cartId}` },
    mutationFn: () => apiFetch<void>(`/sales-carts/${cartId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["sales-carts", "list"] });
    },
    onError: reportError,
  });

  // Applied here rather than in onMutate: a scoped mutation's onMutate only
  // runs once the ones queued before it finish, which would hold back
  // what the seller sees during a run of quick scans.
  const apply = (c: CartChange) => {
    void queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueryData<SalesCart>(key, (cart) => (cart ? applyChange(cart, c) : cart));
    change.mutate(c);
  };

  return {
    addProduct: (product: Product, qty = 1) => apply({ kind: "add", product, qty }),
    setQty: (productId: string, qty: number) => apply({ kind: "qty", productId, qty }),
    update: (patch: {
      customer?: SalesCartCustomer;
      priceList?: PriceList;
      discountPct?: number;
    }) => apply({ kind: "update", patch }),
    share,
    complete,
    cancel,
  };
}
