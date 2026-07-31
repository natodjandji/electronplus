import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { TableRowsSkeleton } from "@/components/table-skeleton";
import { MonthPagerBar, useMonthPager } from "@/components/month-pager";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { SupplierPicker, useSuppliers } from "@/components/supplier-picker";
import { apiFetch, ApiError, reportError } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import { compressImageToBase64 } from "@/lib/image-compress";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/purchases")({
  head: () => ({
    meta: [
      { title: "Compras · Admin Electron Plus" },
      {
        name: "description",
        content: "Control de facturas de proveedores y pagos con alertas de vencimiento.",
      },
      { property: "og:title", content: "Compras · Electron Plus Admin" },
      { property: "og:description", content: "Facturas por vencer y pagos a proveedores." },
    ],
  }),
  component: PurchasesPage,
});

type PayableStatus = "pending" | "paid";
type DueStatus = "current" | "due_soon" | "overdue";

interface Invoice {
  id: string;
  supplierId?: string;
  supplierName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: PayableStatus;
  dueStatus: DueStatus;
  amountPaid: number;
  paymentTerms?: string;
  notes?: string;
}

interface InvoicePayment {
  id: string;
  amount: number;
  method: string;
  reference?: string;
  proofUrl?: string;
  paidAt: string;
}

const DUE_LABEL: Record<DueStatus, string> = {
  overdue: "Vencida",
  due_soon: "Por vencer",
  current: "Vigente",
};

const DUE_BADGE: Record<DueStatus, string> = {
  overdue: "bg-destructive text-white",
  due_soon: "bg-brand-yellow text-brand-navy",
  current: "bg-brand-blue/10 text-brand-blue",
};

const PAYMENT_METHOD_OPTIONS = [
  { value: "transferencia", label: "Transferencia bancaria" },
  { value: "pago_movil", label: "Pago móvil" },
  { value: "efectivo", label: "Efectivo" },
  { value: "zelle", label: "Zelle" },
  { value: "cheque", label: "Cheque" },
  { value: "otro", label: "Otro" },
];

function useInvoices() {
  return useQuery({
    queryKey: ["admin", "invoices"],
    queryFn: () => apiFetch<Invoice[]>("/finance/invoices"),
  });
}

function sum(arr: Invoice[]) {
  return arr.reduce((s, i) => s + i.amount, 0);
}

function PurchasesPage() {
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PayableStatus>("all");
  const { data: invoices, isLoading } = useInvoices();
  const { data: suppliers } = useSuppliers();

  const all = invoices ?? [];
  // The overdue/dueSoon/current summary cards above always consider every
  // invoice regardless of these filters — only the table below is filtered.
  const overdue = all.filter((f) => f.status === "pending" && f.dueStatus === "overdue");
  const dueSoon = all.filter((f) => f.status === "pending" && f.dueStatus === "due_soon");
  const current = all.filter((f) => f.status === "pending" && f.dueStatus === "current");
  const pager = useMonthPager(all, (f) => f.dueDate, { allowFuture: true });

  const needle = search.trim().toLowerCase();
  const visibleInvoices = (pager.filtered ?? [])
    .filter((f) => statusFilter === "all" || f.status === statusFilter)
    .filter((f) => supplierFilter === "all" || f.supplierId === supplierFilter)
    .filter(
      (f) =>
        !needle ||
        f.invoiceNumber.toLowerCase().includes(needle) ||
        f.supplierName.toLowerCase().includes(needle),
    );

  return (
    <AdminShell title="Compras & vencimiento de facturas">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Proveedor</Label>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Estado</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as "all" | PayableStatus)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="paid">Pagada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="N.º de factura o proveedor…"
                className="w-56 pl-8"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {all.length > 0 && (
            <MonthPagerBar
              label={pager.label}
              showAll={pager.showAll}
              onPrev={pager.goPrev}
              onNext={pager.goNext}
              onToggleAll={() => pager.setShowAll((v) => !v)}
              canGoNext={pager.canGoNext}
            />
          )}
          <Button
            className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-4 w-4" /> Nueva factura
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Los resúmenes de vencidas/por vencer/vigentes consideran todas las facturas, sin importar el
        mes que estés viendo abajo.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <SummaryCard
          tone="destructive"
          icon={AlertCircle}
          label="Vencidas"
          count={overdue.length}
          amount={sum(overdue)}
        />
        <SummaryCard
          tone="warning"
          icon={Clock}
          label="Por vencer"
          count={dueSoon.length}
          amount={sum(dueSoon)}
        />
        <SummaryCard
          tone="ok"
          icon={CheckCircle2}
          label="Vigentes"
          count={current.length}
          amount={sum(current)}
        />
      </div>

      {isLoading &&
        [0, 1].map((i) => (
          <Card key={i} className="mt-6 overflow-hidden">
            <div className="border-b border-border p-4">
              <Skeleton className="h-4 w-32" />
            </div>
            <table className="w-full text-sm">
              <tbody>
                <TableRowsSkeleton columns={6} rows={3} />
              </tbody>
            </table>
          </Card>
        ))}

      {!isLoading && all.length === 0 && (
        <Card className="mt-6 p-10 text-center text-muted-foreground">
          No hay facturas de proveedores registradas.
        </Card>
      )}

      {!isLoading && all.length > 0 && visibleInvoices.length === 0 && (
        <Card className="mt-6 p-10 text-center text-muted-foreground">
          No hay facturas que coincidan con estos filtros.
        </Card>
      )}

      {visibleInvoices.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-border p-4">
            <p className="text-xs text-muted-foreground">
              Ordenadas por fecha de vencimiento más próxima.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-brand-surface">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2">Factura</th>
                  <th className="px-4 py-2">Proveedor</th>
                  <th className="px-4 py-2 text-right">Monto</th>
                  <th className="px-4 py-2 text-right">Pagado</th>
                  <th className="px-4 py-2">Vencimiento</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {[...visibleInvoices]
                  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                  .map((f) => (
                    <tr
                      key={f.id}
                      className="cursor-pointer border-t border-border hover:bg-brand-surface"
                      onClick={() => setSelectedId(f.id)}
                    >
                      <td className="px-4 py-3 font-semibold text-brand-navy">{f.invoiceNumber}</td>
                      <td className="px-4 py-3">{f.supplierName}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(f.amount)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatMoney(f.amountPaid)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(f.dueDate).toLocaleDateString("es-VE")}
                      </td>
                      <td className="px-4 py-3">
                        {f.status === "paid" ? (
                          <Badge className="bg-emerald-100 text-emerald-700">Pagada</Badge>
                        ) : (
                          <Badge className={DUE_BADGE[f.dueStatus]}>{DUE_LABEL[f.dueStatus]}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating && <CreateInvoiceDialog onClose={() => setCreating(false)} />}
      {selectedId && (
        <InvoiceDetailDialog invoiceId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </AdminShell>
  );
}

function SummaryCard({
  tone,
  icon: Icon,
  label,
  count,
  amount,
}: {
  tone: "destructive" | "warning" | "ok";
  icon: typeof AlertCircle;
  label: string;
  count: number;
  amount: number;
}) {
  const toneMap = {
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-brand-yellow/25 text-brand-navy",
    ok: "bg-brand-blue/10 text-brand-blue",
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold text-brand-navy">{count}</div>
          <div className="text-sm text-muted-foreground">{formatMoney(amount)}</div>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-md ${toneMap}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function CreateInvoiceDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState(0);
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Invoice>("/finance/invoices", {
        method: "POST",
        body: {
          supplierId,
          supplierName,
          invoiceNumber,
          amount,
          issueDate,
          dueDate,
          paymentTerms: paymentTerms || undefined,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
      toast.success("Factura registrada");
      onClose();
    },
    onError: reportError,
  });

  const canSave = supplierName && invoiceNumber && amount > 0 && issueDate && dueDate;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva factura de proveedor</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Proveedor</Label>
            <SupplierPicker
              value={supplierId}
              onChange={(id, name) => {
                setSupplierId(id);
                setSupplierName(name);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">N° de factura</Label>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Ej. FAC-00123"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Monto (USD)</Label>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Condiciones de pago</Label>
            <Input
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="Ej. 30 días, contado…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Fecha de emisión</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Fecha de vencimiento</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">Notas</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas especiales para esta factura…"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}
          >
            Guardar factura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDetailDialog({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("transferencia");
  const [payReference, setPayReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [terms, setTerms] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const [editingInvoice, setEditingInvoice] = useState(false);
  const [editSupplierId, setEditSupplierId] = useState<string | undefined>();
  const [editSupplierName, setEditSupplierName] = useState("");
  const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
  const [editAmount, setEditAmount] = useState(0);
  const [editIssueDate, setEditIssueDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  const { data: invoices, isLoading, isError } = useInvoices();
  const invoice = invoices?.find((i) => i.id === invoiceId);

  const { data: payments } = useQuery({
    queryKey: ["admin", "invoices", invoiceId, "payments"],
    queryFn: () => apiFetch<InvoicePayment[]>(`/finance/invoices/${invoiceId}/payments`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "invoices", invoiceId, "payments"] });
  };

  const pay = useMutation({
    mutationFn: async () => {
      const proofBase64 = proofFile ? await compressImageToBase64(proofFile) : undefined;
      return apiFetch(`/finance/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: {
          amount: payAmount,
          method: payMethod,
          reference: payReference || undefined,
          proofBase64,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      setPayOpen(false);
      setPayAmount(0);
      setPayReference("");
      setProofFile(null);
      toast.success("Pago registrado");
    },
    onError: reportError,
  });

  const saveTerms = useMutation({
    mutationFn: () =>
      apiFetch(`/finance/invoices/${invoiceId}/payment-terms`, {
        method: "PATCH",
        body: { paymentTerms: terms ?? invoice?.paymentTerms, notes: notes ?? invoice?.notes },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Condiciones actualizadas");
    },
    onError: reportError,
  });

  const saveInvoice = useMutation({
    mutationFn: () =>
      apiFetch(`/finance/invoices/${invoiceId}`, {
        method: "PATCH",
        body: {
          supplierId: editSupplierId,
          supplierName: editSupplierName,
          invoiceNumber: editInvoiceNumber,
          amount: editAmount,
          issueDate: editIssueDate,
          dueDate: editDueDate,
        },
      }),
    onSuccess: () => {
      invalidate();
      setEditingInvoice(false);
      toast.success("Factura actualizada");
    },
    onError: reportError,
  });

  if (isLoading) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando factura…
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isError || !invoice) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div className="font-semibold text-brand-navy">No pudimos cargar esta factura</div>
            <p className="text-muted-foreground">Intenta de nuevo en unos minutos.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const canEditTerms = invoice.status !== "paid";
  const remaining = invoice.amount - invoice.amountPaid;

  const startEditingInvoice = () => {
    setEditSupplierId(invoice.supplierId);
    setEditSupplierName(invoice.supplierName);
    setEditInvoiceNumber(invoice.invoiceNumber);
    setEditAmount(invoice.amount);
    setEditIssueDate(invoice.issueDate);
    setEditDueDate(invoice.dueDate);
    setEditingInvoice(true);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="flex items-center gap-2">
              {invoice.invoiceNumber}
              {invoice.status === "paid" ? (
                <Badge className="bg-emerald-100 text-emerald-700">Pagada</Badge>
              ) : (
                <Badge className={DUE_BADGE[invoice.dueStatus]}>
                  {DUE_LABEL[invoice.dueStatus]}
                </Badge>
              )}
            </DialogTitle>
            {canEditTerms && !editingInvoice && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={startEditingInvoice}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        {!editingInvoice && (
          <div className="text-sm text-muted-foreground">{invoice.supplierName}</div>
        )}

        {!editingInvoice && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Emitida</span>
              <span>{new Date(invoice.issueDate).toLocaleDateString("es-VE")}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Vence</span>
              <span>{new Date(invoice.dueDate).toLocaleDateString("es-VE")}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-brand-navy">
              <span>Total</span>
              <span>{formatMoney(invoice.amount)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Pagado</span>
              <span>{formatMoney(invoice.amountPaid)}</span>
            </div>
            {invoice.status !== "paid" && (
              <div className="flex justify-between font-medium text-brand-navy">
                <span>Saldo pendiente</span>
                <span>{formatMoney(Math.max(0, remaining))}</span>
              </div>
            )}
          </div>
        )}

        {editingInvoice && (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Proveedor</Label>
              <SupplierPicker
                value={editSupplierId}
                onChange={(id, name) => {
                  setEditSupplierId(id);
                  setEditSupplierName(name);
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">N° de factura</Label>
                <Input
                  value={editInvoiceNumber}
                  onChange={(e) => setEditInvoiceNumber(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Monto (USD)</Label>
                <Input
                  type="number"
                  min={invoice.amountPaid || 0.01}
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Fecha de emisión</Label>
                <Input
                  type="date"
                  value={editIssueDate}
                  onChange={(e) => setEditIssueDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Fecha de vencimiento</Label>
                <Input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingInvoice(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-brand-blue text-white hover:bg-brand-blue/90"
                disabled={
                  !editSupplierName ||
                  !editInvoiceNumber ||
                  editAmount <= 0 ||
                  !editIssueDate ||
                  !editDueDate ||
                  saveInvoice.isPending
                }
                onClick={() => saveInvoice.mutate()}
              >
                Guardar cambios
              </Button>
            </div>
          </div>
        )}

        <Separator />

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Condiciones de pago</Label>
            <Input
              disabled={!canEditTerms}
              defaultValue={invoice.paymentTerms ?? ""}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Ej. 30 días"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Notas</Label>
            <Textarea
              disabled={!canEditTerms}
              defaultValue={invoice.notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {canEditTerms && (terms !== null || notes !== null) && (
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              onClick={() => saveTerms.mutate()}
              disabled={saveTerms.isPending}
            >
              Guardar condiciones
            </Button>
          )}
        </div>

        {payments && payments.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Historial de pagos
              </div>
              <div className="mt-2 space-y-2 text-sm">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between border-b border-border py-1.5 last:border-0"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(p.paidAt).toLocaleDateString("es-VE")} · {p.method}
                      {p.reference ? ` · ${p.reference}` : ""}
                      {p.proofUrl && (
                        <a
                          href={p.proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-blue hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="font-semibold text-brand-navy">{formatMoney(p.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {invoice.status !== "paid" && !editingInvoice && (
          <DialogFooter>
            <Button
              className="gap-2 bg-brand-yellow text-brand-navy hover:bg-brand-yellow/90"
              onClick={() => {
                setPayAmount(Math.max(0, remaining));
                setPayOpen(true);
              }}
            >
              <DollarSign className="h-4 w-4" /> Registrar pago
            </Button>
          </DialogFooter>
        )}
      </DialogContent>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Monto</Label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Método</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Referencia</Label>
              <Input
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Comprobante de pago</Label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground hover:border-brand-blue/40">
                <ImageIcon className="h-4 w-4" />
                {proofFile ? proofFile.name : "Adjuntar imagen (opcional)"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                />
              </label>
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
