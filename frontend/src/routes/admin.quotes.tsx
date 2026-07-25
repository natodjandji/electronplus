import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Loader2, Printer, Tag, X } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { CardListSkeleton } from "@/components/table-skeleton";
import { MonthPagerBar, useMonthPager } from "@/components/month-pager";
import { ElectronLogo } from "@/components/electron-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError, reportError } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import {
  paymentMethodLabel,
  usePaymentMethods,
  type PaymentMethodConfig,
} from "@/lib/payment-methods";
import { computeTotal, computeWholesaleTotal } from "@/lib/quote-totals";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/quotes")({
  head: () => ({
    meta: [
      { title: "Cotizaciones · Admin Electron Plus" },
      { name: "description", content: "Revisa, aprueba o rechaza solicitudes de cotización." },
    ],
  }),
  component: AdminQuotesPage,
});

type QuoteStatus = "draft" | "sent" | "approved" | "rejected";

interface QuoteLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  wholesalePrice: number;
  discountPct: number;
}

interface Quote {
  id: string;
  userId: string;
  customerName: string;
  customerTaxId?: string;
  status: QuoteStatus;
  globalDiscountPct: number;
  rejectionReason?: string;
  expectedPaymentMethod?: string;
  items: QuoteLine[];
  createdAt: string;
}

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Borrador",
  sent: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};

const STATUS_BADGE: Record<QuoteStatus, string> = {
  draft: "border-transparent bg-muted text-muted-foreground",
  sent: "border-transparent bg-brand-yellow/25 text-brand-navy",
  approved: "border-transparent bg-emerald-100 text-emerald-700",
  rejected: "border-transparent bg-destructive/10 text-destructive",
};

function useAllQuotes() {
  return useQuery({
    queryKey: ["admin", "quotes"],
    queryFn: () => apiFetch<Quote[]>("/quotes"),
  });
}

function AdminQuotesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("sent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: quotes, isLoading } = useAllQuotes();

  const filtered = (quotes ?? []).filter(
    (q) => statusFilter === "all" || q.status === statusFilter,
  );
  const pager = useMonthPager(filtered, (q) => q.createdAt);
  const visibleQuotes = pager.filtered ?? [];

  return (
    <AdminShell title="Solicitudes de cotización">
      <div className="print:hidden">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Estado</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(Object.keys(STATUS_LABEL) as QuoteStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filtered.length > 0 && (
            <MonthPagerBar
              label={pager.label}
              showAll={pager.showAll}
              onPrev={pager.goPrev}
              onNext={pager.goNext}
              onToggleAll={() => pager.setShowAll((v) => !v)}
              canGoNext={pager.canGoNext}
            />
          )}
        </div>

        {isLoading && <CardListSkeleton />}

        {!isLoading && filtered.length > 0 && visibleQuotes.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            No hay cotizaciones en este período.
          </Card>
        )}

        {!isLoading && filtered.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            No hay cotizaciones con este estado.
          </Card>
        )}

        {visibleQuotes.length > 0 && (
          <div className="space-y-3">
            {visibleQuotes.map((q) => (
              <Card
                key={q.id}
                onClick={() => setSelectedId(q.id)}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-brand-blue/40"
              >
                <div>
                  <div className="font-semibold text-brand-navy">
                    {q.customerName || "Sin nombre"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(q.createdAt).toLocaleDateString("es-VE", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                    {" · "}
                    {q.items.length} producto(s)
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="font-bold text-brand-navy">{formatMoney(computeTotal(q))}</div>
                  </div>
                  <Badge className={STATUS_BADGE[q.status]}>{STATUS_LABEL[q.status]}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedId && <QuoteDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />}
    </AdminShell>
  );
}

function QuoteDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [discountPct, setDiscountPct] = useState(0);
  const [rejectReason, setRejectReason] = useState("");
  const [discountTouched, setDiscountTouched] = useState(false);
  const [useWholesale, setUseWholesale] = useState(false);

  const { data: quote } = useQuery({
    queryKey: ["admin", "quotes", id],
    queryFn: () => apiFetch<Quote>(`/quotes/${id}`),
  });
  const { data: bcv } = useBcvRate();
  const { data: paymentMethods } = usePaymentMethods();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "quotes"] });
  };

  const setDiscount = useMutation({
    mutationFn: (pct: number) =>
      apiFetch(`/quotes/${id}/discount`, { method: "PATCH", body: { globalDiscountPct: pct } }),
    onError: reportError,
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (useWholesale) {
        await apiFetch(`/quotes/${id}/wholesale`, { method: "POST" });
      } else if (discountTouched) {
        await setDiscount.mutateAsync(discountPct);
      }
      return apiFetch(`/quotes/${id}/approve`, { method: "POST" });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Cotización aprobada");
      onClose();
    },
    onError: reportError,
  });

  const reject = useMutation({
    mutationFn: () =>
      apiFetch(`/quotes/${id}/reject`, {
        method: "POST",
        body: { reason: rejectReason || undefined },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Cotización rechazada");
      onClose();
    },
    onError: reportError,
  });

  if (!quote) return null;

  const canDecide = quote.status === "sent";
  const total = computeTotal(quote);
  const wholesaleTotal = computeWholesaleTotal(quote);

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg print:hidden">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle>{quote.customerName || "Sin nombre"}</DialogTitle>
              <div className="flex items-center gap-2">
                <Badge className={STATUS_BADGE[quote.status]}>{STATUS_LABEL[quote.status]}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
                </Button>
              </div>
            </div>
          </DialogHeader>

          {quote.customerTaxId && (
            <div className="text-xs text-muted-foreground">RIF/Cédula: {quote.customerTaxId}</div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-brand-navy">
            <span className="text-muted-foreground">Método de pago que planea usar:</span>
            <span className="font-semibold">
              {paymentMethodLabel(paymentMethods, quote.expectedPaymentMethod) ?? "No indicado"}
            </span>
          </div>

          <div className="max-h-56 overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border bg-brand-surface text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">Detal</th>
                  <th className="px-3 py-2 text-right">Mayor</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium text-brand-navy">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{item.qty}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(item.unitPrice)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {formatMoney(item.wholesalePrice)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-brand-navy">
                      {formatMoney(item.unitPrice * item.qty * (1 - item.discountPct / 100))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md bg-brand-surface p-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Total al detal</div>
              <div className="text-lg font-bold text-brand-navy">{formatMoney(total)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Total al mayor</div>
              <div className="text-lg font-bold text-brand-navy">{formatMoney(wholesaleTotal)}</div>
            </div>
          </div>

          {canDecide ? (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Acuerda con el cliente cómo va a pagar y las condiciones antes de aprobar. El precio
                que definas aquí es el final — el cliente lo verá reflejado al pasar la cotización
                aprobada a pago.
              </p>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <Label className="text-sm font-medium text-brand-navy">
                    Aprobar con precio al mayor
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Cobra el precio mayorista de cada producto en vez del detal.
                  </p>
                </div>
                <Switch checked={useWholesale} onCheckedChange={setUseWholesale} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">
                  Descuento especial % (opcional, al aprobar)
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPct}
                  disabled={useWholesale}
                  onChange={(e) => {
                    setDiscountTouched(true);
                    setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value))));
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">
                  Motivo de rechazo (opcional)
                </Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explica por qué se rechaza, si aplica…"
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => reject.mutate()}
                  disabled={reject.isPending || approve.isPending}
                  variant="outline"
                  className="flex-1 gap-2 text-destructive hover:bg-destructive/5"
                >
                  {reject.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  Rechazar
                </Button>
                <Button
                  onClick={() => approve.mutate()}
                  disabled={approve.isPending || reject.isPending}
                  className="flex-1 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
                >
                  {approve.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Aprobar
                </Button>
              </div>
            </>
          ) : quote.status === "rejected" && quote.rejectionReason ? (
            <div className="rounded-md bg-destructive/5 p-3 text-sm text-destructive">
              Motivo: {quote.rejectionReason}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="hidden print:block">
        <div className="mx-auto max-w-2xl p-6">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <ElectronLogo layout="full" tone="color" className="h-8" />
            <div className="text-right text-xs text-muted-foreground">
              <div className="font-semibold text-brand-navy">Solicitud de cotización</div>
              <div>
                {new Date(quote.createdAt).toLocaleDateString("es-VE", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-lg font-bold text-brand-navy">
              {quote.customerName || "Sin nombre"}
            </div>
            {quote.customerTaxId && (
              <div className="text-sm text-muted-foreground">RIF/Cédula: {quote.customerTaxId}</div>
            )}
            <div className="text-sm text-muted-foreground">
              Estado: {STATUS_LABEL[quote.status]}
            </div>
          </div>

          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Producto</th>
                <th className="py-2 text-right">Detal</th>
                <th className="py-2 text-right">Mayor</th>
                <th className="py-2 text-right">Cant.</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
                <tr key={item.id} className="border-b border-border">
                  <td className="py-3">
                    <div className="font-semibold text-brand-navy">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.sku}</div>
                  </td>
                  <td className="py-3 text-right">{formatMoney(item.unitPrice)}</td>
                  <td className="py-3 text-right text-muted-foreground">
                    {formatMoney(item.wholesalePrice)}
                  </td>
                  <td className="py-3 text-right">{item.qty}</td>
                  <td className="py-3 text-right font-semibold text-brand-navy">
                    {formatMoney(item.unitPrice * item.qty * (1 - item.discountPct / 100))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex flex-col items-end gap-2">
            {quote.globalDiscountPct > 0 && (
              <div className="text-sm text-muted-foreground">
                Descuento especial:{" "}
                <span className="font-semibold text-brand-navy">{quote.globalDiscountPct}%</span>
              </div>
            )}
            <div className="flex items-baseline gap-8">
              <span className="text-lg font-bold text-brand-navy">Total detal</span>
              <span className="flex items-baseline gap-2">
                <span className="text-lg font-bold tabular-nums text-brand-navy">
                  {formatMoney(total)}
                </span>
                {bcv && (
                  <span className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-blue">
                    ≈ {formatBs(total, bcv.rate)}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-brand-yellow/10 px-2.5 py-1.5 text-sm text-brand-navy/70">
              <Tag className="h-3.5 w-3.5 shrink-0 text-brand-yellow" />
              <span className="font-bold tabular-nums text-brand-navy">
                {formatMoney(wholesaleTotal)}
              </span>
              <span>Total al mayor</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
