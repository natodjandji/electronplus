import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2, ShoppingBag, Tag } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PriceTag } from "@/components/price-tag";
import { QuantityStepper } from "@/components/quantity-stepper";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";
import { formatMoney, useElectronStore } from "@/lib/electron-store";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Carrito · Electron Plus" },
      {
        name: "description",
        content: "Revisa los productos que agregaste antes de finalizar tu compra.",
      },
      { property: "og:title", content: "Carrito · Electron Plus" },
      {
        property: "og:description",
        content: "Tu selección con precios actualizados según tu rol.",
      },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { cart, updateQty, removeFromCart, cartTotal, priceFor, clearCart } = useElectronStore();
  const { data: bcv } = useBcvRate();
  const wholesaleTotal = cart.reduce((s, i) => s + i.product.wholesalePrice * i.qty, 0);

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
          Carrito
        </div>
        <h1 className="mt-1 text-3xl font-bold text-brand-navy">Tu compra</h1>

        {cart.length === 0 ? (
          <Card className="mt-8 flex flex-col items-center gap-3 p-12 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground" />
            <div className="text-lg font-semibold text-brand-navy">Tu carrito está vacío</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Agrega productos desde el catálogo para verlos aquí.
            </p>
            <Link to="/catalog">
              <Button className="bg-brand-blue text-white hover:bg-brand-blue/90">
                Ir al catálogo
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-3">
              {cart.map(({ product, qty }) => {
                const unit = priceFor(product);
                return (
                  <Card
                    key={product.id}
                    className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6"
                  >
                    <button
                      onClick={() => removeFromCart(product.id)}
                      className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <div className="flex gap-4 pr-6 sm:flex-1 sm:pr-0">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-20 w-20 shrink-0 rounded-md object-cover sm:h-24 sm:w-24"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {product.sku}
                        </div>
                        <h3 className="truncate text-sm font-semibold text-brand-navy">
                          {product.name}
                        </h3>
                        <div className="mt-1.5">
                          <PriceTag product={product} size="sm" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center sm:gap-2 sm:border-l sm:border-border sm:pl-6">
                      <QuantityStepper qty={qty} onChange={(next) => updateQty(product.id, next)} />
                      <div className="text-base font-bold tabular-nums text-brand-navy sm:text-right">
                        {formatMoney(unit * qty)}
                      </div>
                    </div>
                  </Card>
                );
              })}
              <button
                onClick={clearCart}
                className="text-sm text-muted-foreground hover:text-destructive"
              >
                Vaciar carrito
              </button>
            </div>

            <Card className="h-fit p-6">
              <h2 className="text-lg font-semibold text-brand-navy">Resumen</h2>
              <div className="mt-4 space-y-2 text-sm">
                <Row label="Subtotal" value={formatMoney(cartTotal)} />
                <Row label="Envío" value="A calcular" muted />
                <Separator className="my-3" />
                <div className="flex items-baseline justify-between">
                  <span className="text-brand-navy">Total</span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-base font-bold tabular-nums text-brand-navy">
                      {formatMoney(cartTotal)}
                    </span>
                    {bcv && (
                      <span className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-blue">
                        ≈ {formatBs(cartTotal, bcv.rate)}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-brand-surface px-2.5 py-2 text-xs text-brand-navy/70">
                <span className="flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-brand-yellow" />
                  Total mayorista
                </span>
                <span className="font-semibold tabular-nums">{formatMoney(wholesaleTotal)}</span>
              </div>

              <Link to="/checkout">
                <Button className="mt-6 w-full bg-brand-blue text-white hover:bg-brand-blue/90">
                  Ir a checkout
                </Button>
              </Link>
              <Link to="/catalog">
                <Button variant="outline" className="mt-2 w-full">
                  Seguir comprando
                </Button>
              </Link>
            </Card>
          </div>
        )}
      </section>
    </PublicShell>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-muted-foreground" : "text-brand-navy"}>{label}</span>
      <span className={bold ? "text-base font-bold text-brand-navy" : "text-brand-navy"}>
        {value}
      </span>
    </div>
  );
}
