import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, Ban, ChevronRight, Loader2 } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  OrderStepper,
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABEL,
  nextOrderStatus,
  type OrderStatus,
} from "@/components/order-stepper";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/orders")({
  head: () => ({
    meta: [
      { title: "Pedidos · Admin Electron Plus" },
      { name: "description", content: "Da seguimiento a los pedidos de los clientes." },
    ],
  }),
  component: AdminOrdersPage,
});

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

function reportError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Ocurrió un error inesperado");
}

function useOrders() {
  return useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => apiFetch<Order[]>("/orders"),
  });
}

function AdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: allOrders, isLoading } = useOrders();
  const orders = allOrders?.filter((o) => statusFilter === "all" || o.status === statusFilter);

  return (
    <AdminShell title="Pedidos">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">Estado</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="mt-6 flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando pedidos…
        </div>
      )}

      {!isLoading && (orders?.length ?? 0) === 0 && (
        <Card className="mt-6 p-10 text-center text-muted-foreground">
          No hay pedidos con este filtro.
        </Card>
      )}

      {orders && orders.length > 0 && (
        <div className="mt-6 space-y-2">
          {orders.map((o) => {
            const itemCount = o.items.reduce((s, i) => s + i.qty, 0);
            return (
              <Card
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-brand-blue/40"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-brand-navy">
                    Pedido #{o.id.slice(0, 8).toUpperCase()} · {o.shippingFullName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(o.createdAt)} · {o.items.length} producto(s) · {itemCount}{" "}
                    unidad(es)
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="font-bold text-brand-navy">{formatMoney(o.totalAmount)}</div>
                  </div>
                  <Badge className={ORDER_STATUS_BADGE[o.status]}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selectedId && <OrderDetailDialog orderId={selectedId} onClose={() => setSelectedId(null)} />}
    </AdminShell>
  );
}

function OrderDetailDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const {
    data: order,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["admin", "orders", "detail", orderId],
    queryFn: () => apiFetch<Order>(`/orders/${orderId}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
  };

  const advance = useMutation({
    mutationFn: () => apiFetch(`/orders/${orderId}/advance`, { method: "PATCH" }),
    onSuccess: () => {
      invalidate();
      toast.success("Pedido avanzado");
    },
    onError: reportError,
  });

  const cancel = useMutation({
    mutationFn: () => apiFetch(`/orders/${orderId}/cancel`, { method: "PATCH" }),
    onSuccess: () => {
      invalidate();
      toast.success("Pedido cancelado");
    },
    onError: reportError,
  });

  if (isLoading) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando pedido…
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isError || !order) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div className="font-semibold text-brand-navy">No pudimos cargar este pedido</div>
            <p className="text-muted-foreground">Intenta de nuevo en unos minutos.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const next = nextOrderStatus(order.status);
  const canCancel = order.status !== "fulfilled" && order.status !== "cancelled";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>
              Pedido #{order.id.slice(0, 8).toUpperCase()} · {order.shippingFullName}
            </DialogTitle>
            <Badge className={ORDER_STATUS_BADGE[order.status]}>
              {ORDER_STATUS_LABEL[order.status]}
            </Badge>
          </div>
        </DialogHeader>

        <OrderStepper status={order.status} />

        <div className="text-xs text-muted-foreground">
          Emitido el {formatDate(order.createdAt)} · {PAYMENT_METHOD_LABEL[order.paymentMethod]}
        </div>

        <div className="max-h-56 overflow-y-auto rounded-md border border-border">
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
              {order.items.map((item) => (
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
          Total {formatMoney(order.totalAmount)}
        </div>

        <Separator />

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Datos de envío
          </div>
          <div className="grid gap-1 text-sm text-brand-navy">
            <div>{order.shippingFullName}</div>
            <div className="text-muted-foreground">{order.shippingPhone}</div>
            {order.shippingTaxId && (
              <div className="text-muted-foreground">{order.shippingTaxId}</div>
            )}
            <div>{order.shippingAddress}</div>
            <div>
              {order.shippingCity}, {order.shippingState}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {canCancel && (
              <Button
                variant="outline"
                className="gap-2 text-destructive"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
              >
                <Ban className="h-4 w-4" /> Cancelar pedido
              </Button>
            )}
          </div>
          {next && (
            <Button
              className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
              onClick={() => advance.mutate()}
              disabled={advance.isPending}
            >
              Avanzar a {ORDER_STATUS_LABEL[next]}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
