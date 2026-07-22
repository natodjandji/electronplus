import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  Loader2,
  Plus,
  Printer,
  Send,
  Tag,
  Trash2,
} from "lucide-react";
import { ElectronLogo } from "@/components/electron-logo";
import { PublicShell } from "@/components/public-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/electron-store";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";
import { toast } from "sonner";

export const Route = createFileRoute("/quotes")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
    new: search.new === true || search.new === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Cotizaciones · Electron Plus" },
      {
        name: "description",
        content: "Solicita una cotización personalizada y da seguimiento a su estado.",
      },
      { property: "og:title", content: "Cotizaciones · Electron Plus" },
      { property: "og:description", content: "Solicita cotizaciones de productos eléctricos." },
    ],
  }),
  component: QuotesPage,
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
  customerName: string;
  customerTaxId?: string;
  status: QuoteStatus;
  globalDiscountPct: number;
  rejectionReason?: string;
  items: QuoteLine[];
  createdAt: string;
}

interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  retailPrice: number;
  stock: number;
}

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Borrador",
  sent: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
};

const STATUS_BADGE: Record<QuoteStatus, string> = {
  draft: "border-transparent bg-muted text-muted-foreground",
  sent: "border-transparent bg-brand-yellow/25 text-brand-navy",
  approved: "border-transparent bg-emerald-100 text-emerald-700",
  rejected: "border-transparent bg-destructive/10 text-destructive",
};

function computeTotal(quote: Quote): number {
  const subtotal = quote.items.reduce(
    (s, i) => s + i.unitPrice * i.qty * (1 - i.discountPct / 100),
    0,
  );
  return subtotal * (1 - quote.globalDiscountPct / 100);
}

function computeWholesaleTotal(quote: Quote): number {
  return quote.items.reduce((s, i) => s + i.wholesalePrice * i.qty, 0);
}

function reportError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Ocurrió un error inesperado");
}

function useMyQuotes(enabled: boolean) {
  return useQuery({
    queryKey: ["quotes", "mine"],
    queryFn: () => apiFetch<Quote[]>("/quotes/mine"),
    enabled,
  });
}

function useProductPicker() {
  return useQuery({
    queryKey: ["quotes", "products-picker"],
    queryFn: () => apiFetch<{ data: CatalogProduct[] }>("/products?limit=100"),
    select: (res) => res.data,
  });
}

function QuotesPage() {
  const { new: startNew } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "new" | "builder">("list");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: quotes, isLoading, isError } = useMyQuotes(!!user);

  useEffect(() => {
    if (startNew) setView("new");
  }, [startNew]);

  const invalidateMine = () => queryClient.invalidateQueries({ queryKey: ["quotes", "mine"] });

  const handleCreate = async () => {
    setCreating(true);
    try {
      const quote = await apiFetch<Quote>("/quotes", {
        method: "POST",
        body: {
          customerName: customerName.trim(),
          customerTaxId: customerTaxId.trim() || undefined,
        },
      });
      invalidateMine();
      setActiveId(quote.id);
      setView("builder");
    } catch (error) {
      reportError(error);
    } finally {
      setCreating(false);
    }
  };

  const handleOpen = (quote: Quote) => {
    setActiveId(quote.id);
    setView("builder");
  };

  const handleBack = () => {
    setView("list");
    setActiveId(null);
    setCustomerName("");
    setCustomerTaxId("");
  };

  if (!authLoading && !user) {
    return (
      <PublicShell>
        <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-2xl font-bold text-brand-navy">Inicia sesión para cotizar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Necesitas una cuenta para enviar solicitudes de cotización y ver su estado.
          </p>
          <Link to="/login" search={{ redirect: "/quotes" }}>
            <Button className="mt-6 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90">
              Iniciar sesión
            </Button>
          </Link>
        </section>
      </PublicShell>
    );
  }

  if (view === "new") {
    return (
      <PublicShell>
        <section className="mx-auto max-w-xl px-4 py-10 sm:px-6">
          <button
            onClick={handleBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a mis cotizaciones
          </button>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
            Cotizaciones
          </div>
          <h1 className="mt-1 text-3xl font-bold text-brand-navy">Nueva solicitud</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dinos para quién es la cotización antes de elegir productos.
          </p>

          <Card className="mt-6 p-6">
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Cliente</Label>
                <Input
                  placeholder="Razón social o nombre"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">
                  RIF / Cédula (opcional)
                </Label>
                <Input
                  placeholder="J-000000000"
                  value={customerTaxId}
                  onChange={(e) => setCustomerTaxId(e.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={handleCreate}
              disabled={!customerName.trim() || creating}
              className="mt-6 w-full gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Continuar
            </Button>
          </Card>
        </section>
      </PublicShell>
    );
  }

  if (view === "builder" && activeId) {
    return <QuoteBuilder id={activeId} onBack={handleBack} />;
  }

  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
              Cotizaciones
            </div>
            <h1 className="mt-1 text-3xl font-bold text-brand-navy">Mis cotizaciones</h1>
          </div>
          <Button
            onClick={() => setView("new")}
            className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          >
            <Plus className="h-4 w-4" />
            Nueva cotización
          </Button>
        </div>

        {isLoading && (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando cotizaciones…
          </div>
        )}

        {isError && (
          <Card className="mt-8 p-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
            <div className="mt-3 text-sm font-semibold text-brand-navy">
              No pudimos cargar tus cotizaciones
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Intenta de nuevo en unos minutos.</p>
          </Card>
        )}

        {!isLoading && !isError && quotes?.length === 0 && (
          <Card className="mt-8 p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-3 text-sm font-semibold text-brand-navy">
              Aún no tienes cotizaciones
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea tu primera solicitud para verla aquí.
            </p>
            <Button
              onClick={() => setView("new")}
              className="mt-4 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
            >
              <Plus className="h-4 w-4" />
              Nueva cotización
            </Button>
          </Card>
        )}

        {quotes && quotes.length > 0 && (
          <div className="mt-8 space-y-3">
            {quotes.map((q) => (
              <QuoteListCard
                key={q.id}
                quote={q}
                onOpen={() => handleOpen(q)}
                onDeleted={invalidateMine}
              />
            ))}
          </div>
        )}
      </section>
    </PublicShell>
  );
}

function QuoteListCard({
  quote,
  onOpen,
  onDeleted,
}: {
  quote: Quote;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/quotes/${quote.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Borrador eliminado");
      onDeleted();
    },
    onError: reportError,
  });

  return (
    <Card
      onClick={onOpen}
      className="flex cursor-pointer flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-brand-blue/40"
    >
      <div>
        <div className="font-semibold text-brand-navy">{quote.customerName || "Sin nombre"}</div>
        <div className="text-xs text-muted-foreground">
          {new Date(quote.createdAt).toLocaleDateString("es-VE", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
          {" · "}
          {quote.items.length} producto(s)
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="font-bold text-brand-navy">{formatMoney(computeTotal(quote))}</div>
        </div>
        <Badge className={STATUS_BADGE[quote.status]}>{STATUS_LABEL[quote.status]}</Badge>
        {quote.status === "draft" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground transition-colors hover:text-destructive"
                aria-label="Eliminar borrador"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar este borrador?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción no se puede deshacer. Se eliminará la cotización de{" "}
                  {quote.customerName || "este cliente"}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </Card>
  );
}

function QuoteBuilder({ id, onBack }: { id: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quotes", id],
    queryFn: () => apiFetch<Quote>(`/quotes/${id}`),
  });
  const { data: products } = useProductPicker();
  const { data: bcv } = useBcvRate();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["quotes", id] });
    queryClient.invalidateQueries({ queryKey: ["quotes", "mine"] });
  };

  const isDraft = quote?.status === "draft";

  const addLine = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await apiFetch(`/quotes/${id}/lines`, { method: "POST", body: { productId: pick, qty: 1 } });
      setPick("");
      invalidate();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const updateQty = async (lineId: string, qty: number) => {
    try {
      await apiFetch(`/quotes/${id}/lines/${lineId}`, {
        method: "PATCH",
        body: { qty: Math.max(1, qty) },
      });
      invalidate();
    } catch (error) {
      reportError(error);
    }
  };

  const removeLine = async (lineId: string) => {
    try {
      await apiFetch(`/quotes/${id}/lines/${lineId}`, { method: "DELETE" });
      invalidate();
    } catch (error) {
      reportError(error);
    }
  };

  const handleSend = async () => {
    setBusy(true);
    try {
      await apiFetch(`/quotes/${id}/send`, { method: "POST" });
      toast.success("Solicitud enviada. Te avisamos cuando la revisemos.");
      queryClient.invalidateQueries({ queryKey: ["quotes", "mine"] });
      onBack();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !quote) {
    return (
      <PublicShell>
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando cotización…
        </div>
      </PublicShell>
    );
  }

  const total = computeTotal(quote);
  const wholesaleTotal = computeWholesaleTotal(quote);

  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-navy print:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a mis cotizaciones
        </button>

        <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
          Cotizaciones
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <h1 className="mt-1 truncate text-3xl font-bold text-brand-navy">{quote.customerName}</h1>
          <div className="flex items-center gap-2">
            {!isDraft && (
              <Badge className={STATUS_BADGE[quote.status]}>{STATUS_LABEL[quote.status]}</Badge>
            )}
            <div className="flex items-center gap-2 print:hidden">
              <Button variant="outline" onClick={() => window.print()} className="gap-2">
                <Printer className="h-4 w-4" />
                Imprimir / PDF
              </Button>
              {isDraft && (
                <Button
                  onClick={handleSend}
                  disabled={quote.items.length === 0 || busy}
                  className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar solicitud
                </Button>
              )}
            </div>
          </div>
        </div>

        {!isDraft && (
          <Card className="mt-4 p-4 text-sm">
            {quote.status === "sent" && (
              <p className="text-brand-navy">
                Tu solicitud está en revisión. Te avisaremos cuando el equipo la apruebe o rechace.
              </p>
            )}
            {quote.status === "approved" && (
              <p className="text-brand-navy">
                Cotización aprobada
                {quote.globalDiscountPct > 0 && (
                  <>
                    {" "}
                    con un descuento especial del <b>{quote.globalDiscountPct}%</b>
                  </>
                )}
                .
              </p>
            )}
            {quote.status === "rejected" && (
              <p className="text-brand-navy">
                Esta solicitud fue rechazada
                {quote.rejectionReason ? <>: {quote.rejectionReason}</> : "."}
              </p>
            )}
          </Card>
        )}

        <Card className="mt-6 p-6">
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

          {isDraft && (
            <>
              <div className="mt-6 flex flex-wrap items-end gap-3 print:hidden">
                <div className="grid flex-1 gap-1.5 min-w-64">
                  <Label className="text-xs font-medium text-brand-navy">Agregar producto</Label>
                  <Select value={pick} onValueChange={setPick}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar producto…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(products ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={addLine}
                  disabled={!pick || busy}
                  className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
                >
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              </div>
              <Separator className="my-6" />
            </>
          )}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Detal</th>
                  <th className="py-2 text-right">Mayor</th>
                  <th className="py-2 text-right">Cant.</th>
                  <th className="py-2 text-right">Total</th>
                  {isDraft && <th className="print:hidden" />}
                </tr>
              </thead>
              <tbody>
                {quote.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={isDraft ? 6 : 5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {isDraft
                        ? "Agrega productos para armar tu solicitud."
                        : "Esta cotización no tiene productos."}
                    </td>
                  </tr>
                )}
                {quote.items.map((item) => {
                  const lineTotal = item.unitPrice * item.qty * (1 - item.discountPct / 100);
                  return (
                    <tr key={item.id} className="border-b border-border">
                      <td className="py-3">
                        <div className="font-semibold text-brand-navy">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.sku}</div>
                      </td>
                      <td className="py-3 text-right">{formatMoney(item.unitPrice)}</td>
                      <td className="py-3 text-right text-muted-foreground">
                        {formatMoney(item.wholesalePrice)}
                      </td>
                      <td className="py-3 text-right">
                        {isDraft ? (
                          <>
                            <Input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={(e) => updateQty(item.id, Number(e.target.value))}
                              className="ml-auto h-8 w-20 text-right print:hidden"
                            />
                            <span className="hidden print:inline">{item.qty}</span>
                          </>
                        ) : (
                          item.qty
                        )}
                      </td>
                      <td className="py-3 text-right font-semibold text-brand-navy">
                        {formatMoney(lineTotal)}
                      </td>
                      {isDraft && (
                        <td className="py-3 pl-2 text-right print:hidden">
                          <button
                            onClick={() => removeLine(item.id)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Quitar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
        </Card>
      </section>
    </PublicShell>
  );
}
