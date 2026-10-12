import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Loader2, Plus, ShoppingBasket } from "lucide-react";
import { SellerShell } from "@/components/seller/seller-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/electron-store";
import { computeCartTotals, type SalesCart } from "@/lib/sales-carts";
import { useCreateSalesCart, useSalesCartList } from "@/lib/use-sales-carts";

export const Route = createFileRoute("/vendedor/")({
  component: SellerHome,
});

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });
}

function SellerHome() {
  const navigate = useNavigate();
  const createCart = useCreateSalesCart();
  const open = useSalesCartList("open");
  const soldToday = useSalesCartList("completed");

  const startCart = () =>
    createCart.mutate(undefined, {
      onSuccess: (cart) => navigate({ to: "/vendedor/carrito/$id", params: { id: cart.id } }),
    });

  return (
    <SellerShell>
      <Button
        size="lg"
        onClick={startCart}
        disabled={createCart.isPending}
        className="h-14 w-full gap-2 rounded-xl bg-brand-blue text-base text-white hover:bg-brand-blue/90"
      >
        {createCart.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Plus className="h-5 w-5" />
        )}
        Nuevo carrito
      </Button>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Carritos abiertos
        </h2>
        {open.isLoading ? (
          <ListSkeleton />
        ) : (open.data ?? []).length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <ShoppingBasket className="h-6 w-6 text-brand-blue" />
            No tienes carritos abiertos. Crea uno para empezar a escanear.
          </Card>
        ) : (
          <div className="space-y-2">
            {open.data!.map((cart) => (
              <CartRow key={cart.id} cart={cart} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Hoy
          </h2>
          {(soldToday.data?.length ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground">
              {soldToday.data!.length} {soldToday.data!.length === 1 ? "venta" : "ventas"} ·{" "}
              {formatMoney(soldToday.data!.reduce((sum, c) => sum + computeCartTotals(c).total, 0))}
            </span>
          )}
        </div>
        {soldToday.isLoading ? (
          <ListSkeleton rows={1} />
        ) : (soldToday.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no has cerrado ventas hoy.</p>
        ) : (
          <div className="space-y-2">
            {soldToday.data!.map((cart) => (
              <CartRow key={cart.id} cart={cart} />
            ))}
          </div>
        )}
      </section>
    </SellerShell>
  );
}

function CartRow({ cart }: { cart: SalesCart }) {
  const { profile } = useAuth();
  const units = cart.items.reduce((sum, i) => sum + i.qty, 0);
  const { total } = computeCartTotals(cart);
  const someoneElse = profile && cart.sellerId !== profile.id;
  return (
    <Link to="/vendedor/carrito/$id" params={{ id: cart.id }} className="block">
      <Card className="flex items-center gap-3 p-4 transition-colors hover:border-brand-blue/40">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-brand-navy">
              {cart.customer.name || "Cliente sin nombre"}
            </span>
            {cart.status === "completed" && (
              <Badge className="border-transparent bg-emerald-100 text-emerald-700">Vendido</Badge>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {units} {units === 1 ? "unidad" : "unidades"} ·{" "}
            {formatTime(cart.closedAt ?? cart.updatedAt)}
            {someoneElse && ` · ${cart.sellerName}`}
            {cart.invoiceRef && ` · Factura ${cart.invoiceRef}`}
          </div>
        </div>
        <div className="shrink-0 text-right font-semibold tabular-nums text-brand-navy">
          {formatMoney(total)}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  );
}

function ListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />
      ))}
    </div>
  );
}
