import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExternalLink, Receipt, ScanLine, ShoppingBasket, Users } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { TableRowsSkeleton } from "@/components/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { formatMoneyAdmin } from "@/lib/electron-store";
import {
  computeCartTotals,
  formatQuoteNumber,
  PRICE_LIST_LABEL,
  salesCartListKey,
  unitPriceFor,
  type SalesCart,
} from "@/lib/sales-carts";

export const Route = createFileRoute("/admin/in-store-sales")({
  head: () => ({
    meta: [
      { title: "Ventas en tienda · Admin Electron Plus" },
      {
        name: "description",
        content: "Carritos que manejan los vendedores en tienda y ventas cerradas hoy.",
      },
    ],
  }),
  component: InStoreSalesPage,
});

/** The counter moves fast: refetched while the page is open. */
const REFRESH_MS = 30_000;

/** Same query (and cache) as the seller's screen: for an admin the API
 * returns every seller's carts. */
function useCarts(status: "open" | "completed") {
  return useQuery({
    queryKey: salesCartListKey(status),
    queryFn: () => apiFetch<SalesCart[]>(`/sales-carts?status=${status}`),
    refetchInterval: REFRESH_MS,
  });
}

const units = (cart: SalesCart) => cart.items.reduce((sum, i) => sum + i.qty, 0);
const sumTotals = (carts: SalesCart[]) =>
  carts.reduce((sum, cart) => sum + computeCartTotals(cart).total, 0);

/** Today's carts show the time; an older one, the day too. */
function formatWhen(iso: string) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString("es-VE", { day: "numeric", month: "short" })}, ${time}`;
}

interface SellerSummary {
  sellerId: string;
  sellerName: string;
  openCarts: number;
  openTotal: number;
  sales: number;
  soldTotal: number;
}

function summarizeBySeller(open: SalesCart[], sold: SalesCart[]): SellerSummary[] {
  const bySeller = new Map<string, SellerSummary>();
  const entry = (cart: SalesCart) => {
    let summary = bySeller.get(cart.sellerId);
    if (!summary) {
      summary = {
        sellerId: cart.sellerId,
        sellerName: cart.sellerName,
        openCarts: 0,
        openTotal: 0,
        sales: 0,
        soldTotal: 0,
      };
      bySeller.set(cart.sellerId, summary);
    }
    return summary;
  };
  for (const cart of open) {
    const summary = entry(cart);
    summary.openCarts++;
    summary.openTotal += computeCartTotals(cart).total;
  }
  for (const cart of sold) {
    const summary = entry(cart);
    summary.sales++;
    summary.soldTotal += computeCartTotals(cart).total;
  }
  return [...bySeller.values()].sort(
    (a, b) => b.soldTotal + b.openTotal - (a.soldTotal + a.openTotal),
  );
}

function InStoreSalesPage() {
  const open = useCarts("open");
  const sold = useCarts("completed");
  const [selected, setSelected] = useState<SalesCart | null>(null);

  const openCarts = useMemo(() => open.data ?? [], [open.data]);
  const soldCarts = useMemo(() => sold.data ?? [], [sold.data]);
  const sellers = useMemo(() => summarizeBySeller(openCarts, soldCarts), [openCarts, soldCarts]);
  const loading = open.isLoading || sold.isLoading;
  const activeSellers = new Set(openCarts.map((c) => c.sellerId)).size;

  return (
    <AdminShell title="Ventas en tienda">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          Los carritos que los vendedores tienen abiertos y las ventas que cerraron hoy. Se
          actualiza solo cada 30 segundos.
        </p>
        <Button asChild className="shrink-0 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90">
          <Link to="/vendedor">
            <ScanLine className="h-4 w-4" /> Ir a ventas en tienda
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={ShoppingBasket}
          label="Carritos abiertos"
          value={loading ? "—" : String(openCarts.length)}
          hint={
            loading
              ? undefined
              : `${activeSellers} ${activeSellers === 1 ? "vendedor" : "vendedores"}`
          }
        />
        <StatCard
          icon={ShoppingBasket}
          label="En carritos abiertos"
          value={loading ? "—" : formatMoneyAdmin(sumTotals(openCarts))}
          hint="Con IVA"
        />
        <StatCard
          icon={Receipt}
          label="Ventas de hoy"
          value={loading ? "—" : String(soldCarts.length)}
        />
        <StatCard
          icon={Receipt}
          label="Vendido hoy"
          value={loading ? "—" : formatMoneyAdmin(sumTotals(soldCarts))}
          hint="Con IVA"
        />
      </div>

      <Section icon={Users} title="Por vendedor">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-brand-surface">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2">Vendedor</th>
              <th className="px-4 py-2 text-right">Carritos abiertos</th>
              <th className="px-4 py-2 text-right">En carritos</th>
              <th className="px-4 py-2 text-right">Ventas hoy</th>
              <th className="px-4 py-2 text-right">Vendido hoy</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableRowsSkeleton rows={2} columns={5} />}
            {!loading && sellers.length === 0 && (
              <EmptyRow columns={5}>Ningún vendedor tiene carritos ni ventas hoy.</EmptyRow>
            )}
            {sellers.map((s) => (
              <tr key={s.sellerId} className="border-t border-border">
                <td className="px-4 py-3 font-medium text-brand-navy">{s.sellerName}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.openCarts}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatMoneyAdmin(s.openTotal)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{s.sales}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-navy">
                  {formatMoneyAdmin(s.soldTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon={ShoppingBasket} title="Carritos abiertos">
        <CartsTable
          carts={openCarts}
          loading={open.isLoading}
          empty="No hay carritos abiertos en este momento."
          onSelect={setSelected}
        />
      </Section>

      <Section icon={Receipt} title="Ventas de hoy">
        <CartsTable
          carts={soldCarts}
          loading={sold.isLoading}
          empty="Todavía no se ha cerrado ninguna venta hoy."
          onSelect={setSelected}
          sold
        />
      </Section>

      {selected && <CartDialog cart={selected} onClose={() => setSelected(null)} />}
    </AdminShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-brand-blue" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-brand-navy">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Receipt;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-navy">
        <Icon className="h-4 w-4 text-brand-blue" />
        {title}
      </h2>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">{children}</div>
      </Card>
    </section>
  );
}

function EmptyRow({ columns, children }: { columns: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={columns} className="py-8 text-center text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

function CartsTable({
  carts,
  loading,
  empty,
  onSelect,
  sold = false,
}: {
  carts: SalesCart[];
  loading: boolean;
  empty: string;
  onSelect: (cart: SalesCart) => void;
  sold?: boolean;
}) {
  return (
    <table className="w-full min-w-[720px] text-sm">
      <thead className="bg-brand-surface">
        <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th className="px-4 py-2">Cliente</th>
          <th className="px-4 py-2">Vendedor</th>
          <th className="px-4 py-2 text-right">Unidades</th>
          <th className="px-4 py-2">{sold ? "Factura" : "Lista de precios"}</th>
          <th className="px-4 py-2 text-right">Total</th>
          <th className="px-4 py-2 text-right">{sold ? "Hora" : "Última actividad"}</th>
        </tr>
      </thead>
      <tbody>
        {loading && <TableRowsSkeleton rows={2} columns={6} />}
        {!loading && carts.length === 0 && <EmptyRow columns={6}>{empty}</EmptyRow>}
        {carts.map((cart) => (
          <tr
            key={cart.id}
            onClick={() => onSelect(cart)}
            className="cursor-pointer border-t border-border transition-colors hover:bg-brand-surface/60"
          >
            <td className="px-4 py-3">
              <div className="font-medium text-brand-navy">
                {cart.customer.name || "Cliente sin nombre"}
              </div>
              {cart.quoteNumber !== undefined && (
                <div className="text-xs text-muted-foreground">
                  Cotización {formatQuoteNumber(cart.quoteNumber)}
                </div>
              )}
            </td>
            <td className="px-4 py-3 text-muted-foreground">{cart.sellerName}</td>
            <td className="px-4 py-3 text-right tabular-nums">{units(cart)}</td>
            <td className="px-4 py-3 text-muted-foreground">
              {sold ? cart.invoiceRef || "—" : PRICE_LIST_LABEL[cart.priceList]}
            </td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-navy">
              {formatMoneyAdmin(computeCartTotals(cart).total)}
            </td>
            <td className="px-4 py-3 text-right text-muted-foreground">
              {formatWhen(sold ? (cart.closedAt ?? cart.updatedAt) : cart.updatedAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CartDialog({ cart, onClose }: { cart: SalesCart; onClose: () => void }) {
  const totals = computeCartTotals(cart);
  const { customer } = cart;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {customer.name || "Cliente sin nombre"}
            {cart.status === "completed" ? (
              <Badge className="border-transparent bg-emerald-100 text-emerald-700">Vendido</Badge>
            ) : (
              <Badge className="border-transparent bg-brand-yellow/30 text-brand-navy">
                Abierto
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Detail label="Vendedor" value={cart.sellerName} />
          <Detail label="Lista de precios" value={PRICE_LIST_LABEL[cart.priceList]} />
          {customer.taxId && <Detail label="RIF / Cédula" value={customer.taxId} />}
          {customer.phone && <Detail label="Teléfono" value={customer.phone} />}
          {cart.quoteNumber !== undefined && (
            <Detail label="Cotización" value={formatQuoteNumber(cart.quoteNumber)} />
          )}
          {cart.invoiceRef && <Detail label="Factura en Profit" value={cart.invoiceRef} />}
          <Detail
            label={cart.status === "completed" ? "Vendido" : "Última actividad"}
            value={formatWhen(cart.closedAt ?? cart.updatedAt)}
          />
        </dl>

        <div className="mt-2 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border bg-brand-surface text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {cart.items.length === 0 && (
                <EmptyRow columns={4}>Todavía no tiene productos.</EmptyRow>
              )}
              {cart.items.map((item) => {
                const price = unitPriceFor(item, cart.priceList);
                return (
                  <tr key={item.productId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium text-brand-navy">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoneyAdmin(price)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-brand-navy">
                      {formatMoneyAdmin(price * item.qty)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-right tabular-nums">{formatMoneyAdmin(totals.subtotal)}</dd>
          {cart.discountPct > 0 && (
            <>
              <dt className="text-muted-foreground">Descuento ({cart.discountPct}%)</dt>
              <dd className="text-right tabular-nums">
                −{formatMoneyAdmin(totals.discountAmount)}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">IVA</dt>
          <dd className="text-right tabular-nums">{formatMoneyAdmin(totals.taxAmount)}</dd>
          <dt className="font-semibold text-brand-navy">Total</dt>
          <dd className="text-right font-semibold tabular-nums text-brand-navy">
            {formatMoneyAdmin(totals.total)}
          </dd>
        </dl>

        <Button asChild variant="outline" className="mt-2 gap-2">
          <Link to="/vendedor/carrito/$id" params={{ id: cart.id }}>
            <ExternalLink className="h-4 w-4" /> Abrir en ventas en tienda
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-brand-navy">{value}</dd>
    </div>
  );
}
