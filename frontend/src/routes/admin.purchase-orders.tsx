import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Send, DollarSign, Ban, Clock } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/purchase-orders")({
  head: () => ({
    meta: [
      { title: "Órdenes de compra · Admin Electron Plus" },
      { name: "description", content: "Crea y da seguimiento a órdenes de compra a proveedores." },
    ],
  }),
  component: PurchaseOrdersPage,
});

type PurchaseOrderStatus = "draft" | "issued" | "partially_paid" | "paid" | "cancelled";

interface PurchaseOrderItem {
  productId: string;
  sku: string;
  name: string;
  quantityOrdered: number;
  unitCost: number;
  discountPerItem: number;
  subtotal: number;
}

interface PurchaseOrder {
  id: string;
  supplierId?: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  globalDiscount: number;
  totals: { subtotal: number; totalDiscount: number; totalAmount: number };
  paymentTerms?: string;
  notes?: string;
  status: PurchaseOrderStatus;
  amountPaid: number;
  paymentDetails?: { paidAt: string; method: string; reference?: string };
  createdAt: string;
}

interface PurchaseOrderPayment {
  id: string;
  amount: number;
  method: string;
  reference?: string;
  paidAt: string;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
}

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Borrador",
  issued: "Emitida",
  partially_paid: "Parcialmente pagada",
  paid: "Pagada",
  cancelled: "Cancelada",
};

const STATUS_BADGE: Record<PurchaseOrderStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  issued: "bg-brand-blue/10 text-brand-blue",
  partially_paid: "bg-brand-yellow/25 text-brand-navy",
  paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-destructive/10 text-destructive",
};

function useProductOptions() {
  return useQuery({
    queryKey: ["admin", "products-picker"],
    queryFn: () => apiFetch<{ data: ProductOption[] }>("/products?limit=200"),
    select: (res) => res.data,
  });
}

function usePurchaseOrders(filters: { status?: string; supplierId?: string }) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.supplierId) params.set("supplierId", filters.supplierId);
  const qs = params.toString();
  return useQuery({
    queryKey: ["admin", "purchase-orders", filters],
    queryFn: () => apiFetch<PurchaseOrder[]>(`/purchase-orders${qs ? `?${qs}` : ""}`),
  });
}

function reportError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Ocurrió un error inesperado");
}

function PurchaseOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: orders, isLoading } = usePurchaseOrders({
    status: statusFilter === "all" ? undefined : statusFilter,
    supplierId: supplierFilter || undefined,
  });

  return (
    <AdminShell title="Órdenes de compra">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Estado</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(Object.keys(STATUS_LABEL) as PurchaseOrderStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Proveedor (ID)</Label>
            <Input
              placeholder="Filtrar por supplierId…"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-56"
            />
          </div>
        </div>
        <Button className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nueva orden
        </Button>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-surface">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Proveedor</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Pagado</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Creada</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              )}
              {!isLoading && (orders?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No hay órdenes de compra con estos filtros.
                  </td>
                </tr>
              )}
              {orders?.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer border-t border-border hover:bg-brand-surface"
                  onClick={() => setSelectedId(o.id)}
                >
                  <td className="px-4 py-3 font-semibold text-brand-navy">{o.supplierName}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(o.totals.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatMoney(o.amountPaid)}</td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_BADGE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString("es-VE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {creating && <CreateOrderDialog onClose={() => setCreating(false)} />}
      {selectedId && <OrderDetailDialog orderId={selectedId} onClose={() => setSelectedId(null)} />}
    </AdminShell>
  );
}

type DraftLine = { productId: string; sku: string; name: string; quantityOrdered: number; unitCost: number; discountPerItem: number };

function CreateOrderDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: products } = useProductOptions();

  const [supplierName, setSupplierName] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [pick, setPick] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<PurchaseOrder>("/purchase-orders", {
        method: "POST",
        body: {
          supplierName,
          paymentTerms: paymentTerms || undefined,
          notes: notes || undefined,
          globalDiscount,
          items: lines.map((l) => ({
            productId: l.productId,
            quantityOrdered: l.quantityOrdered,
            unitCost: l.unitCost,
            discountPerItem: l.discountPerItem,
          })),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "purchase-orders"] });
      toast.success("Orden de compra creada como borrador");
      onClose();
    },
    onError: reportError,
  });

  const addLine = () => {
    const product = products?.find((p) => p.id === pick);
    if (!product || lines.some((l) => l.productId === pick)) return;
    setLines((prev) => [...prev, { productId: product.id, sku: product.sku, name: product.name, quantityOrdered: 1, unitCost: 0, discountPerItem: 0 }]);
    setPick("");
  };

  const lineSubtotal = (l: DraftLine) => l.unitCost * l.quantityOrdered * (1 - l.discountPerItem / 100);
  const subtotalAfterLines = lines.reduce((s, l) => s + lineSubtotal(l), 0);
  const totalAmount = subtotalAfterLines * (1 - globalDiscount / 100);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva orden de compra</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Proveedor</Label>
            <Input placeholder="Nombre del proveedor" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Condiciones de pago</Label>
            <Input placeholder="Ej. 30 días, contado…" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">Notas</Label>
          <Textarea placeholder="Notas especiales para esta orden…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <Separator />

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-64 flex-1 gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Agregar producto</Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar producto…" />
              </SelectTrigger>
              <SelectContent>
                {products?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={addLine} className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90">
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Producto</th>
                <th className="py-2 text-right">Cant.</th>
                <th className="py-2 text-right">Costo unit.</th>
                <th className="py-2 text-right">Desc. %</th>
                <th className="py-2 text-right">Subtotal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    Agrega productos a la orden.
                  </td>
                </tr>
              )}
              {lines.map((l) => (
                <tr key={l.productId} className="border-b border-border">
                  <td className="py-2">
                    <div className="font-medium text-brand-navy">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{l.sku}</div>
                  </td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      min={1}
                      value={l.quantityOrdered}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) => (x.productId === l.productId ? { ...x, quantityOrdered: Math.max(1, Number(e.target.value)) } : x)),
                        )
                      }
                      className="ml-auto h-8 w-20 text-right"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unitCost}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) => (x.productId === l.productId ? { ...x, unitCost: Math.max(0, Number(e.target.value)) } : x)),
                        )
                      }
                      className="ml-auto h-8 w-24 text-right"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={l.discountPerItem}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.productId === l.productId
                              ? { ...x, discountPerItem: Math.min(100, Math.max(0, Number(e.target.value))) }
                              : x,
                          ),
                        )
                      }
                      className="ml-auto h-8 w-20 text-right"
                    />
                  </td>
                  <td className="py-2 text-right font-semibold text-brand-navy">{formatMoney(lineSubtotal(l))}</td>
                  <td className="py-2 pl-2 text-right">
                    <button
                      onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Quitar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Descuento global %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={globalDiscount}
              onChange={(e) => setGlobalDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
              className="h-8 w-20 text-right"
            />
          </div>
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between text-lg font-bold text-brand-navy">
              <span>Total</span>
              <span>{formatMoney(totalAmount)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!supplierName || lines.length === 0 || create.isPending}
            onClick={() => create.mutate()}
          >
            Guardar borrador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetailDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("transferencia");
  const [payReference, setPayReference] = useState("");
  const [terms, setTerms] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const { data: order } = useQuery({
    queryKey: ["admin", "purchase-orders", orderId],
    queryFn: () => apiFetch<PurchaseOrder>(`/purchase-orders/${orderId}`),
  });
  const { data: payments } = useQuery({
    queryKey: ["admin", "purchase-orders", orderId, "payments"],
    queryFn: () => apiFetch<PurchaseOrderPayment[]>(`/purchase-orders/${orderId}/payments`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "purchase-orders"] });
  };

  const issue = useMutation({
    mutationFn: () => apiFetch(`/purchase-orders/${orderId}/issue`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast.success("Orden emitida");
    },
    onError: reportError,
  });

  const cancel = useMutation({
    mutationFn: () => apiFetch(`/purchase-orders/${orderId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast.success("Orden cancelada");
    },
    onError: reportError,
  });

  const pay = useMutation({
    mutationFn: () =>
      apiFetch(`/purchase-orders/${orderId}/payments`, {
        method: "POST",
        body: { amount: payAmount, method: payMethod, reference: payReference || undefined },
      }),
    onSuccess: () => {
      invalidate();
      setPayOpen(false);
      setPayAmount(0);
      setPayReference("");
      toast.success("Pago registrado");
    },
    onError: reportError,
  });

  const saveTerms = useMutation({
    mutationFn: () =>
      apiFetch(`/purchase-orders/${orderId}/payment-terms`, {
        method: "PATCH",
        body: { paymentTerms: terms ?? order?.paymentTerms, notes: notes ?? order?.notes },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Condiciones actualizadas");
    },
    onError: reportError,
  });

  if (!order) return null;

  const canEditTerms = order.status !== "paid" && order.status !== "cancelled";
  const remaining = order.totals.totalAmount - order.amountPaid;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {order.supplierName}
            <Badge className={STATUS_BADGE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {order.items.map((item) => (
            <div key={item.productId} className="flex items-center justify-between border-b border-border py-2 last:border-0">
              <div>
                <div className="font-medium text-brand-navy">{item.name}</div>
                <div className="text-xs text-muted-foreground">
                  {item.sku} · {item.quantityOrdered} × {formatMoney(item.unitCost)}
                  {item.discountPerItem > 0 ? ` · -${item.discountPerItem}%` : ""}
                </div>
              </div>
              <div className="font-semibold text-brand-navy">{formatMoney(item.subtotal)}</div>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatMoney(order.totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Descuento total</span>
            <span>-{formatMoney(order.totals.totalDiscount)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-brand-navy">
            <span>Total</span>
            <span>{formatMoney(order.totals.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Pagado</span>
            <span>{formatMoney(order.amountPaid)}</span>
          </div>
          {order.status !== "paid" && order.status !== "cancelled" && (
            <div className="flex justify-between font-medium text-brand-navy">
              <span>Saldo pendiente</span>
              <span>{formatMoney(Math.max(0, remaining))}</span>
            </div>
          )}
        </div>

        <Separator />

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Condiciones de pago</Label>
            <Input
              disabled={!canEditTerms}
              defaultValue={order.paymentTerms ?? ""}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Ej. 30 días"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Notas</Label>
            <Textarea
              disabled={!canEditTerms}
              defaultValue={order.notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {canEditTerms && (terms !== null || notes !== null) && (
            <Button size="sm" variant="outline" className="justify-self-start" onClick={() => saveTerms.mutate()} disabled={saveTerms.isPending}>
              Guardar condiciones
            </Button>
          )}
        </div>

        {payments && payments.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Historial de pagos</div>
              <div className="mt-2 space-y-2 text-sm">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(p.paidAt).toLocaleDateString("es-VE")} · {p.method}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </div>
                    <div className="font-semibold text-brand-navy">{formatMoney(p.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {order.status !== "paid" && order.status !== "cancelled" && (
              <Button variant="outline" className="gap-2 text-destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                <Ban className="h-4 w-4" /> Cancelar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {order.status === "draft" && (
              <Button className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90" onClick={() => issue.mutate()} disabled={issue.isPending}>
                <Send className="h-4 w-4" /> Emitir
              </Button>
            )}
            {(order.status === "issued" || order.status === "partially_paid") && (
              <Button
                className="gap-2 bg-brand-yellow text-brand-navy hover:bg-brand-yellow/90"
                onClick={() => {
                  setPayAmount(Math.max(0, remaining));
                  setPayOpen(true);
                }}
              >
                <DollarSign className="h-4 w-4" /> Registrar pago
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Monto</Label>
              <Input type="number" min={0.01} step="0.01" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Método</Label>
              <Input value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="transferencia, efectivo…" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Referencia</Label>
              <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-brand-blue text-white hover:bg-brand-blue/90"
              disabled={payAmount <= 0 || pay.isPending}
              onClick={() => pay.mutate()}
            >
              Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
