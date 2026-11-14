import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import { ProductImage } from "@/components/product-image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import type { Product } from "@/lib/product";
import { productGroupQuery } from "@/lib/product-groups";
import { matchesWords } from "@/lib/product-search";
import type { SalesCartItem } from "@/lib/sales-carts";

/** Remains open after each addition: one shelf QR can supply several lines
 * to the same sale. The existing cart actions own optimistic state/queuing. */
export function ProductGroupDialog({
  groupId,
  items,
  onAdd,
  onClose,
}: {
  groupId: string;
  items: SalesCartItem[];
  onAdd: (product: Product) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const { data: group, isPending, isError, error, refetch } = useQuery(productGroupQuery(groupId));
  // No six-result cap or closed picker: show every member on opening.
  const products = (group?.products ?? []).filter((p) =>
    matchesWords(search, p.name, p.model, p.sku, p.specs),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="pr-6">
          <DialogTitle className="break-words">{group?.name ?? "Productos del grupo"}</DialogTitle>
          <DialogDescription>
            Agrega los productos que necesitas. Puedes elegir varios sin cerrar esta lista.
          </DialogDescription>
        </DialogHeader>
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar dentro de este grupo…"
            aria-label="Buscar dentro de este grupo"
            className="pl-9"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isPending ? (
            <div
              className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando productos…
            </div>
          ) : isError ? (
            <div className="py-8 text-center text-sm" role="alert">
              <p>
                {error instanceof ApiError && error.status === 404
                  ? "Este grupo ya no existe."
                  : "No pudimos cargar los productos del grupo."}
              </p>
              <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </div>
          ) : products.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {group?.products.length
                ? "Sin resultados dentro de este grupo."
                : "Este grupo no tiene productos disponibles en el catálogo."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {products.map((product) => {
                const qty = items.find((i) => i.productId === product.id)?.qty ?? 0;
                return (
                  <li key={product.id} className="flex items-start gap-3 py-4">
                    <ProductImage
                      src={product.thumbnail}
                      alt={product.name}
                      className="h-14 w-14 shrink-0 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-semibold text-brand-navy">
                        {product.name}
                      </div>
                      {product.model && (
                        <p className="text-xs text-muted-foreground">SKU {product.model}</p>
                      )}
                      {product.specs && (
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {product.specs}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-brand-navy">
                        <span>Detal {formatMoney(product.retailPrice)}</span>
                        <span>Mayor {formatMoney(product.wholesalePrice)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <Button
                          size="sm"
                          className="gap-1.5 bg-brand-blue text-white hover:bg-brand-blue/90"
                          aria-label={`Agregar ${product.name}`}
                          onClick={() => onAdd(product)}
                        >
                          <Plus className="h-4 w-4" /> Agregar
                        </Button>
                        <span className="text-xs text-muted-foreground" aria-live="polite">
                          {qty} en el carrito
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t border-border pt-3">
          <Button variant="outline" onClick={onClose}>
            Volver al carrito
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
