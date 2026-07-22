import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, Loader2, PackageSearch } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";

export const Route = createFileRoute("/client/orders")({
  head: () => ({
    meta: [
      { title: "Mis pedidos · Electron Plus" },
      { name: "description", content: "Historial y estado de tus pedidos en Electron Plus." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientOrdersPage,
});

type OrderStatus = "pending_payment_verification" | "paid" | "fulfilled" | "cancelled";

type PaymentMethod = "bank_transfer" | "pago_movil" | "cash" | "zelle" | "paypal" | "credit_b2b";

interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  categoryLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface Order {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  shippingFullName: string;
  shippingPhone: string;
  shippingTaxId?: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  items: OrderItem[];
  createdAt: string;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment_verification: "Procesando",
  paid: "Pagado",
  fulfilled: "Entregado",
  cancelled: "Cancelado",
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending_payment_verification: "border-transparent bg-brand-yellow/25 text-brand-navy",
  paid: "border-transparent bg-brand-blue/10 text-brand-blue",
  fulfilled: "border-transparent bg-emerald-100 text-emerald-700",
  cancelled: "border-transparent bg-destructive/10 text-destructive",
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "Transferencia bancaria",
  pago_movil: "Pago móvil",
  cash: "Efectivo",
  zelle: "Zelle",
  paypal: "PayPal",
  credit_b2b: "Crédito B2B",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function useMyOrders() {
  return useQuery({
    queryKey: ["orders", "mine"],
    queryFn: () => apiFetch<Order[]>("/orders/mine"),
  });
}

function ClientOrdersPage() {
  const { data: orders, isLoading, isError } = useMyOrders();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedOrder = orders?.find((o) => o.id === selectedId) ?? null;

  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
          Mi cuenta
        </div>
        <h1 className="mt-1 text-3xl font-bold text-brand-navy">Mis pedidos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulta el historial y el estado de tus compras.
        </p>

        {isLoading && (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando pedidos…
          </div>
        )}

        {isError && (
          <Card className="mt-8 p-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
            <div className="mt-3 text-sm font-semibold text-brand-navy">
              No pudimos cargar tus pedidos
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Intenta de nuevo en unos minutos.</p>
          </Card>
        )}

        {!isLoading && !isError && orders?.length === 0 && (
          <Card className="mt-8 p-10 text-center">
            <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-3 text-sm font-semibold text-brand-navy">Aún no tienes pedidos</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Cuando compres en el catálogo, tus pedidos aparecerán aquí.
            </p>
          </Card>
        )}

        {orders && orders.length > 0 && (
          <div className="mt-8 space-y-3">
            {orders.map((order) => {
              const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
              return (
                <Card
                  key={order.id}
                  onClick={() => setSelectedId(order.id)}
                  className="flex cursor-pointer flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-brand-blue/40"
                >
                  <div>
                    <div className="font-semibold text-brand-navy">
                      Pedido #{order.id.slice(0, 8).toUpperCase()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(order.createdAt)} · {order.items.length} producto(s) · {itemCount}{" "}
                      unidad(es)
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Total</div>
                      <div className="font-bold text-brand-navy">
                        {formatMoney(order.totalAmount)}
                      </div>
                    </div>
                    <Badge className={STATUS_BADGE[order.status]}>
                      {STATUS_LABEL[order.status]}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {selectedOrder && (
        <Dialog open onOpenChange={(open) => !open && setSelectedId(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center justify-between gap-3 pr-6">
                <DialogTitle>Pedido #{selectedOrder.id.slice(0, 8).toUpperCase()}</DialogTitle>
                <Badge className={STATUS_BADGE[selectedOrder.status]}>
                  {STATUS_LABEL[selectedOrder.status]}
                </Badge>
              </div>
            </DialogHeader>

            <div className="text-xs text-muted-foreground">
              Emitido el {formatDate(selectedOrder.createdAt)} ·{" "}
              {PAYMENT_METHOD_LABEL[selectedOrder.paymentMethod]}
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-brand-surface text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item) => (
                    <tr key={item.productId} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-brand-navy">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-right">{item.qty}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-brand-navy">
                        {formatMoney(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end text-lg font-bold text-brand-navy">
              Total {formatMoney(selectedOrder.totalAmount)}
            </div>

            <Separator />

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Datos de envío
              </div>
              <div className="grid gap-1 text-sm text-brand-navy">
                <div>{selectedOrder.shippingFullName}</div>
                <div className="text-muted-foreground">{selectedOrder.shippingPhone}</div>
                {selectedOrder.shippingTaxId && (
                  <div className="text-muted-foreground">{selectedOrder.shippingTaxId}</div>
                )}
                <div>{selectedOrder.shippingAddress}</div>
                <div>
                  {selectedOrder.shippingCity}, {selectedOrder.shippingState}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PublicShell>
  );
}
