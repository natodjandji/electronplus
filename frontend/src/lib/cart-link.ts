import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useElectronStore } from "./electron-store";
import { catalogQuery, toProduct } from "./product-api";

export interface CartLinkLine {
  id: string;
  qty: number;
}

const MAX_LINES = 50;

/** `agregar=id:qty,id:qty` — the cart the WhatsApp/Instagram assistant
 * builds for a customer (backend sales-tools cartUrl). Malformed pieces are
 * skipped; a repeated id keeps its last quantity. */
export function parseCartLink(value: string): CartLinkLine[] {
  const lines = new Map<string, number>();
  for (const piece of value.split(",").slice(0, MAX_LINES)) {
    const sep = piece.lastIndexOf(":");
    if (sep <= 0) continue;
    const id = decodeURIComponent(piece.slice(0, sep)).trim();
    const qty = Number(piece.slice(sep + 1));
    if (!id || !Number.isInteger(qty) || qty < 1) continue;
    lines.set(id, qty);
  }
  return [...lines].map(([id, qty]) => ({ id, qty }));
}

/** Loads a cart link into the cart once it has hydrated, at the quantities
 * the link names (opening it twice doesn't double them), then drops the
 * parameter from the address. */
export function useCartLinkImport(link: string | undefined) {
  const { cartHydrated, cart, addToCart, updateQty } = useElectronStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (!link || !cartHydrated || handled.current) return;
    handled.current = true;
    const lines = parseCartLink(link);
    void (async () => {
      try {
        const { data } = await queryClient.fetchQuery(catalogQuery);
        const byId = new Map(data.map((p) => [p.id, p]));
        let added = 0;
        const missing: string[] = [];
        for (const line of lines) {
          const found = byId.get(line.id);
          if (!found || found.stock <= 0) {
            missing.push(found?.name ?? "un producto");
            continue;
          }
          if (cart.some((item) => item.product.id === line.id)) updateQty(line.id, line.qty);
          else addToCart(toProduct(found), line.qty);
          added++;
        }
        if (added > 0)
          toast.success(`Agregamos ${added} producto${added === 1 ? "" : "s"} a tu carrito`);
        if (missing.length > 0) {
          toast.warning(`No disponible ahora: ${missing.join(", ")}`);
        }
      } catch {
        toast.error("No pudimos cargar los productos del enlace. Intenta de nuevo.");
      } finally {
        void navigate({ to: "/cart", search: {}, replace: true });
      }
    })();
  }, [link, cartHydrated, cart, addToCart, updateQty, queryClient, navigate]);
}
