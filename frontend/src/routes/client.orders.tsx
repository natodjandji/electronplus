import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  FileText,
  Loader2,
  PackageSearch,
  Upload,
  X,
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  OrderStepper,
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABEL,
  type OrderStatus,
} from "@/components/order-stepper";
import { apiFetch, ApiError } from "@/lib/api-client";
import { compressImageToBase64 } from "@/lib/image-compress";
import { formatMoney } from "@/lib/electron-store";
import { toast } from "sonner";

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

interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  status: "pending" | "verified" | "rejected";
  reference?: string;
  rejectionReason?: string;
}

interface PaymentMethodConfig {
  id: string;
  backendMethod: string;
  label: string;
  needsReference: boolean;
  needsProof: boolean;
  enabled: boolean;
}

function reportError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Ocurrió un error inesperado");
}

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
                    <Badge className={ORDER_STATUS_BADGE[order.status]}>
                      {ORDER_STATUS_LABEL[order.status]}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {selectedOrder && (
        <OrderDetailDialog order={selectedOrder} onClose={() => setSelectedId(null)} />
      )}
    </PublicShell>
  );
}

function OrderDetailDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { data: payments } = useQuery({
    queryKey: ["orders", "mine", "payments", order.id],
    queryFn: () => apiFetch<Payment[]>(`/payments/order/${order.id}`),
  });
  const payment = payments?.[0];
  const canRetry =
    order.status === "pending_payment_verification" && payment?.status === "rejected";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>Pedido #{order.id.slice(0, 8).toUpperCase()}</DialogTitle>
            <Badge className={ORDER_STATUS_BADGE[order.status]}>
              {ORDER_STATUS_LABEL[order.status]}
            </Badge>
          </div>
        </DialogHeader>

        <OrderStepper status={order.status} />

        <div className="text-xs text-muted-foreground">
          Emitido el {formatDate(order.createdAt)} · {PAYMENT_METHOD_LABEL[order.paymentMethod]}
        </div>

        {canRetry && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <div className="font-semibold text-destructive">Tu pago fue rechazado</div>
              {payment?.rejectionReason && (
                <p className="mt-0.5 text-muted-foreground">{payment.rejectionReason}</p>
              )}
              <p className="mt-0.5 text-muted-foreground">
                Puedes cambiar el método de pago o volver a enviar el comprobante.
              </p>
            </div>
          </div>
        )}

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

        {canRetry && (
          <>
            <Separator />
            <RetryPaymentForm order={order} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RetryPaymentForm({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const { data: paymentMethods } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => apiFetch<PaymentMethodConfig[]>("/payment-methods"),
  });
  const enabledMethods = paymentMethods?.filter((m) => m.enabled) ?? [];

  const [methodId, setMethodId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [proofBase64, setProofBase64] = useState<string | undefined>();
  const [proofFileName, setProofFileName] = useState<string | undefined>();
  const [proofBusy, setProofBusy] = useState(false);

  const selected =
    enabledMethods.find((m) => m.id === methodId) ??
    enabledMethods.find((m) => m.backendMethod === order.paymentMethod) ??
    enabledMethods[0];

  const handleProofFile = async (file: File) => {
    setProofBusy(true);
    try {
      const base64 = await compressImageToBase64(file);
      setProofBase64(base64);
      setProofFileName(file.name);
    } catch {
      toast.error("No se pudo procesar la imagen del comprobante.");
    } finally {
      setProofBusy(false);
    }
  };

  const retry = useMutation({
    mutationFn: () =>
      apiFetch(`/orders/${order.id}/retry-payment`, {
        method: "POST",
        body: {
          paymentMethod: selected!.backendMethod,
          paymentReference: reference.trim() || undefined,
          paymentProofBase64: proofBase64,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", "mine"] });
      toast.success("Pago reenviado — quedará pendiente de verificación.");
    },
    onError: reportError,
  });

  const canSubmit = Boolean(selected) && (!selected?.needsReference || reference.trim().length > 0);

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Reintentar pago
      </div>

      {enabledMethods.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando métodos de pago…
        </div>
      ) : (
        <RadioGroup
          value={selected?.id}
          onValueChange={setMethodId}
          className="grid gap-2 sm:grid-cols-2"
        >
          {enabledMethods.map((m) => (
            <label
              key={m.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition ${
                selected?.id === m.id ? "border-brand-blue bg-brand-blue/5" : "border-border"
              }`}
            >
              <RadioGroupItem value={m.id} />
              <span className="font-medium text-brand-navy">{m.label}</span>
            </label>
          ))}
        </RadioGroup>
      )}

      {selected?.needsReference && (
        <div className="mt-3 grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">
            Número de referencia / confirmación
          </Label>
          <Input
            placeholder="0000000000"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      )}

      {selected?.needsProof && (
        <div className="mt-3 grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">
            Comprobante de pago (opcional)
          </Label>
          {proofFileName ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm">
              <span className="flex items-center gap-2 truncate text-brand-navy">
                <FileText className="h-4 w-4 shrink-0 text-brand-blue" />
                <span className="truncate">{proofFileName}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setProofBase64(undefined);
                  setProofFileName(undefined);
                }}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Quitar comprobante"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground transition hover:border-brand-blue/40 hover:text-brand-blue">
              {proofBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Subir captura del pago
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleProofFile(file);
                }}
              />
            </label>
          )}
        </div>
      )}

      <Button
        className="mt-4 w-full bg-brand-blue text-white hover:bg-brand-blue/90"
        disabled={!canSubmit || retry.isPending}
        onClick={() => retry.mutate()}
      >
        {retry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Reenviar pago
      </Button>
    </div>
  );
}
