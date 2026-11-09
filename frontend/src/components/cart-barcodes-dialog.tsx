import { useMemo, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { barRuns, code128Modules } from "@/lib/barcode";
import type { SalesCart } from "@/lib/sales-carts";
import { cn } from "@/lib/utils";

/** Blank modules each side: a scanner needs them to find where it starts. */
const QUIET_ZONE = 10;
const BAR_HEIGHT = 40;

/**
 * `code` as a Code 128 barcode, black on white whatever the theme, so a
 * scanner can read it off the screen. It scales with its container, up to
 * three pixels a module.
 */
export function Barcode({ code, className }: { code: string; className?: string }) {
  const modules = useMemo(() => code128Modules(code), [code]);
  if (!modules) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Este código no se puede mostrar como barra: escríbelo en Profit.
      </p>
    );
  }
  const width = modules.length + QUIET_ZONE * 2;
  return (
    <svg
      viewBox={`0 0 ${width} ${BAR_HEIGHT}`}
      role="img"
      aria-label={`Código de barras ${code}`}
      shapeRendering="crispEdges"
      className={cn("block h-auto w-full", className)}
      style={{ maxWidth: width * 3 }}
    >
      <rect width={width} height={BAR_HEIGHT} fill="#fff" />
      {barRuns(modules).map(([x, w]) => (
        <rect key={x} x={x + QUIET_ZONE} width={w} height={BAR_HEIGHT} fill="#000" />
      ))}
    </svg>
  );
}

/**
 * A cart's products as barcodes, each with its quantity and description, to
 * scan one after another into the invoice in Profit. Tapping a product
 * marks it as done (only on this screen), so it's easy to see what's left.
 */
export function CartBarcodesDialog({
  cart,
  onClose,
}: {
  cart: Pick<SalesCart, "customer" | "items">;
  onClose: () => void;
}) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const units = cart.items.reduce((sum, item) => sum + item.qty, 0);
  const toggle = (productId: string) =>
    setDone((current) => {
      const next = new Set(current);
      if (!next.delete(productId)) next.add(productId);
      return next;
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Only the list scrolls: the title, the close button and the count
          stay in view however long the cart is. */}
      <DialogContent className="flex max-h-[92vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>Códigos de barra</DialogTitle>
          <DialogDescription>
            {cart.customer.name || "Cliente sin nombre"} · {cart.items.length}{" "}
            {cart.items.length === 1 ? "producto" : "productos"} · {units}{" "}
            {units === 1 ? "unidad" : "unidades"}. Escanéalos para montar la factura en Profit y
            toca cada uno al cargarlo.
          </DialogDescription>
        </DialogHeader>

        {cart.items.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium tabular-nums text-brand-navy">
              Cargados: {done.size} de {cart.items.length}
            </span>
            {done.size > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-muted-foreground"
                onClick={() => setDone(new Set())}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Empezar de nuevo
              </Button>
            )}
          </div>
        )}

        <ol className="-mx-6 -mb-6 grid min-h-0 flex-1 content-start gap-3 overflow-y-auto overscroll-contain px-6 pb-6">
          {cart.items.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              Este carrito todavía no tiene productos.
            </li>
          )}
          {cart.items.map((item) => {
            const isDone = done.has(item.productId);
            return (
              <li key={item.productId}>
                <button
                  type="button"
                  aria-pressed={isDone}
                  onClick={() => toggle(item.productId)}
                  className={cn(
                    "grid w-full gap-3 rounded-lg border p-3 text-left transition-colors",
                    isDone
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-border bg-white hover:border-brand-blue/40",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex min-w-14 shrink-0 flex-col items-center rounded-md px-2 py-1 leading-none",
                        isDone ? "bg-emerald-600 text-white" : "bg-brand-navy text-white",
                      )}
                    >
                      <span className="text-2xl font-bold tabular-nums">{item.qty}</span>
                      <span className="mt-0.5 text-[10px] uppercase tracking-wide">
                        {item.qty === 1 ? "unidad" : "unid."}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-semibold leading-snug text-brand-navy">
                        {item.name}
                      </div>
                      {item.model && (
                        <div className="text-xs text-muted-foreground">SKU {item.model}</div>
                      )}
                    </div>
                    {isDone && (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
                        <Check className="h-4 w-4" /> Cargado
                      </span>
                    )}
                  </div>
                  <div className={cn("grid justify-items-center gap-1", isDone && "opacity-40")}>
                    <Barcode code={item.sku} />
                    <span className="font-mono text-sm tracking-widest text-brand-navy">
                      {item.sku}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
