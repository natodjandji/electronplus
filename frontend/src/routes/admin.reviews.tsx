import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  ListChecks,
  Loader2,
  MessageSquareText,
  Plus,
  Printer,
  QrCode,
  Star,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { MonthYearPicker, useMonthPeriod } from "@/components/month-pager";
import { PaginationBar, usePagination } from "@/components/pagination";
import { CardListSkeleton } from "@/components/table-skeleton";
import { WhatsappIcon } from "@/components/whatsapp-icon";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { periodQuery } from "@/lib/admin-period";
import { apiFetch, reportError } from "@/lib/api-client";
import { RATING_LABELS, reviewsKey, type Review, type ReviewSource } from "@/lib/reviews";
import { whatsappShareHref } from "@/lib/sales-carts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/reviews")({
  head: () => ({
    meta: [
      { title: "Reseñas · Admin Electron Plus" },
      {
        name: "description",
        content: "Reseñas que dejan los clientes desde el QR de la tienda.",
      },
    ],
  }),
  component: ReviewsPage,
});

const PAGE_SIZE = 20;

const FILTERS = [
  { id: "all", label: "Todas", test: () => true },
  { id: "low", label: "1–2 ★", test: (r: Review) => r.rating <= 2 },
  { id: "mid", label: "3 ★", test: (r: Review) => r.rating === 3 },
  { id: "high", label: "4–5 ★", test: (r: Review) => r.rating >= 4 },
  { id: "message", label: "Con mensaje", test: (r: Review) => Boolean(r.message) },
  {
    id: "contact",
    label: "Con contacto",
    test: (r: Review) => Boolean(r.customerName || r.customerPhone),
  },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

const average = (reviews: Review[]) =>
  reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
const formatAverage = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 1 });
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-VE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ReviewsPage() {
  const period = useMonthPeriod();
  const [filter, setFilter] = useState<FilterId>("all");
  const [qrOpen, setQrOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [...reviewsKey, period.key],
    queryFn: () => apiFetch<Review[]>(`/reviews?${periodQuery(period, "timestamp")}`),
  });
  const reviews = useMemo(() => data ?? [], [data]);

  const stats = useMemo(() => {
    const bySource = new Map<string, { label: string; count: number }>();
    const bySeller = new Map<string, { name: string; ratings: number[] }>();
    const byRating = [0, 0, 0, 0, 0, 0];
    // Newest first: each group shows the answer's latest name.
    for (const r of reviews) {
      byRating[r.rating]++;
      const source = bySource.get(r.sourceId) ?? { label: r.sourceLabel, count: 0 };
      source.count++;
      bySource.set(r.sourceId, source);
      if (r.sellerId) {
        const seller = bySeller.get(r.sellerId) ?? { name: r.sellerName ?? "—", ratings: [] };
        seller.ratings.push(r.rating);
        bySeller.set(r.sellerId, seller);
      }
    }
    return {
      byRating,
      sources: [...bySource.values()].sort((a, b) => b.count - a.count),
      sellers: [...bySeller.values()]
        .map((s) => ({
          name: s.name,
          count: s.ratings.length,
          average: s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length,
          happy: s.ratings.filter((x) => x >= 4).length,
        }))
        .sort((a, b) => b.count - a.count),
      low: reviews.filter((r) => r.rating <= 2).length,
      happy: reviews.filter((r) => r.rating >= 4).length,
    };
  }, [reviews]);

  const filtered = useMemo(() => {
    const { test } = FILTERS.find((f) => f.id === filter)!;
    return reviews.filter(test);
  }, [reviews, filter]);
  const pagination = usePagination(filtered, PAGE_SIZE, `${period.key}:${filter}`);

  return (
    <AdminShell title="Reseñas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthYearPicker period={period} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setOptionsOpen(true)}>
            <ListChecks className="h-4 w-4" /> Opciones de "¿Cómo llegaste?"
          </Button>
          <Button
            className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
            onClick={() => setQrOpen(true)}
          >
            <QrCode className="h-4 w-4" /> QR de la tienda
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Reseñas"
          value={isLoading ? "—" : String(reviews.length)}
          hint="En el mes"
        />
        <StatCard
          label="Promedio"
          value={isLoading || !reviews.length ? "—" : `${formatAverage(average(reviews))} / 5`}
          star
        />
        <StatCard
          label="Satisfechos"
          value={isLoading || !reviews.length ? "—" : `${percent(stats.happy, reviews.length)}%`}
          hint="4 o 5 estrellas"
        />
        <StatCard
          label="Para atender"
          value={isLoading ? "—" : String(stats.low)}
          hint="1 o 2 estrellas"
          alert={stats.low > 0}
        />
      </div>

      {reviews.length > 0 && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-brand-navy">Puntuación de la atención</h2>
            <div className="mt-4 space-y-2">
              {[5, 4, 3, 2, 1].map((n) => (
                <BarRow
                  key={n}
                  label={`${n} ★`}
                  count={stats.byRating[n]}
                  total={reviews.length}
                  barClass={n <= 2 ? "bg-destructive/70" : "bg-brand-yellow"}
                />
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-brand-navy">¿Cómo llegaron a la tienda?</h2>
            <div className="mt-4 space-y-2">
              {stats.sources.map((s) => (
                <BarRow
                  key={s.label}
                  label={s.label}
                  count={s.count}
                  total={reviews.length}
                  barClass="bg-brand-blue"
                />
              ))}
            </div>
          </Card>
        </div>
      )}

      {stats.sellers.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-brand-surface">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2 text-right">Reseñas</th>
                  <th className="px-4 py-2 text-right">Promedio</th>
                  <th className="px-4 py-2 text-right">Satisfechos</th>
                </tr>
              </thead>
              <tbody>
                {stats.sellers.map((s) => (
                  <tr key={s.name} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-brand-navy">{s.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatAverage(s.average)} ★
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {percent(s.happy, s.count)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar reseñas">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.id
                  ? "border-brand-blue bg-brand-blue text-white"
                  : "border-border bg-white text-brand-navy hover:border-brand-blue/50",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {isLoading && <CardListSkeleton rows={3} />}
          {!isLoading && filtered.length === 0 && (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              {reviews.length === 0
                ? "Todavía no hay reseñas este mes. Imprime el QR de la tienda para empezar a recibirlas."
                : "Ninguna reseña con este filtro."}
            </Card>
          )}
          {pagination.pageItems.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
        <PaginationBar
          className="mt-4"
          page={pagination.page}
          totalPages={pagination.totalPages}
          onChange={pagination.setPage}
          from={pagination.from}
          to={pagination.to}
          total={pagination.total}
        />
      </section>

      {qrOpen && <QrDialog onClose={() => setQrOpen(false)} />}
      {optionsOpen && <SourcesDialog onClose={() => setOptionsOpen(false)} />}
    </AdminShell>
  );
}

function StatCard({
  label,
  value,
  hint,
  star = false,
  alert = false,
}: {
  label: string;
  value: string;
  hint?: string;
  star?: boolean;
  alert?: boolean;
}) {
  return (
    <Card className={cn("p-4", alert && "border-destructive/40 bg-destructive/5")}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-2xl font-bold tabular-nums text-brand-navy">
        {value}
        {star && value !== "—" && <Star className="h-5 w-5 fill-brand-yellow text-brand-yellow" />}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function BarRow({
  label,
  count,
  total,
  barClass,
}: {
  label: string;
  count: number;
  total: number;
  barClass: string;
}) {
  const pct = percent(count, total);
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] items-center gap-3 text-sm">
      <span className="truncate text-brand-navy" title={label}>
        {label}
      </span>
      <div className="h-2 overflow-hidden rounded-full bg-brand-surface">
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right text-xs tabular-nums text-muted-foreground">
        {count} · {pct}%
      </span>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "h-4 w-4",
            n <= rating ? "fill-brand-yellow text-brand-yellow" : "text-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => apiFetch(`/reviews/${review.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewsKey });
      toast.success("Reseña eliminada");
    },
    onError: reportError,
  });
  const low = review.rating <= 2;
  const greeting = `Hola${review.customerName ? ` ${review.customerName}` : ""}, te escribimos de Electron Plus por la reseña que nos dejaste.`;

  return (
    <Card className={cn("p-4", low && "border-destructive/30 bg-destructive/[0.03]")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Stars rating={review.rating} />
            <span className="text-sm font-semibold text-brand-navy">
              {RATING_LABELS[review.rating]}
            </span>
            <span className="text-xs text-muted-foreground">
              · {formatDateTime(review.createdAt)}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Llegó por <span className="font-medium text-brand-navy">{review.sourceLabel}</span>
            {review.sourceOther && <> ("{review.sourceOther}")</>}
            {review.sellerName && (
              <>
                {" "}
                · Lo atendió{" "}
                <span className="font-medium text-brand-navy">{review.sellerName}</span>
              </>
            )}
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              aria-label="Eliminar reseña"
              className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar esta reseña?</AlertDialogTitle>
              <AlertDialogDescription>
                Úsalo para quitar reseñas falsas o de prueba. No se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => remove.mutate()}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {review.message && (
        <p className="mt-3 flex gap-2 whitespace-pre-line text-sm text-brand-navy">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {review.message}
        </p>
      )}

      {(review.customerName || review.customerPhone) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            {review.customerName || "Sin nombre"}
          </span>
          {review.customerPhone && (
            <a
              href={whatsappShareHref(greeting, review.customerPhone)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 font-medium text-brand-blue hover:underline"
            >
              <WhatsappIcon className="h-3.5 w-3.5" />
              {review.customerPhone}
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

/** A printable sign for the counter: the QR with a line telling customers
 * what it's for. */
function printSign(qrImageDataUrl: string, url: string) {
  const win = window.open("", "_blank", "width=600,height=800");
  if (!win) {
    toast.error("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes.");
    return;
  }
  const logo = `${window.location.origin}/assets/brand/logo-full-color.svg`;
  win.document
    .write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR reseñas · Electron Plus</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0b2545;text-align:center;margin:0;padding:48px 32px}
  img.logo{height:48px}
  h1{font-size:34px;margin:32px 0 8px}
  p{font-size:18px;margin:0 0 24px;color:#334}
  img.qr{width:320px;height:320px}
  small{display:block;margin-top:16px;font-size:14px;color:#556}
</style></head><body>
  <img class="logo" src="${logo}" alt="Electron Plus">
  <h1>¿Cómo te atendimos?</h1>
  <p>Escanea el código y cuéntanos tu experiencia</p>
  <img class="qr" src="${qrImageDataUrl}" alt="Código QR">
  <small>${url}</small>
</body></html>`);
  win.document.close();
  win.addEventListener("load", () => win.print());
}

function QrDialog({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: [...reviewsKey, "qr"],
    queryFn: () => apiFetch<{ url: string; qrImageDataUrl: string }>("/reviews/qr"),
    staleTime: Infinity,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR de la tienda</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Imprímelo y colócalo en la tienda: abre la página de reseñas en el teléfono del cliente.
        </p>
        <div className="grid place-items-center rounded-md border border-border bg-white p-4">
          {isLoading || !data ? (
            <Loader2 className="my-24 h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <img src={data.qrImageDataUrl} alt="QR de la página de reseñas" className="h-56 w-56" />
          )}
        </div>
        {data && (
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-center text-xs font-medium text-brand-blue hover:underline"
          >
            {data.url}
          </a>
        )}
        <DialogFooter className="grid grid-cols-3 gap-2 sm:space-x-0">
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={!data}
            onClick={() =>
              data &&
              navigator.clipboard.writeText(data.url).then(() => toast.success("Enlace copiado"))
            }
          >
            <Copy className="h-4 w-4" /> Copiar
          </Button>
          {data ? (
            <Button variant="outline" className="gap-1.5" asChild>
              <a href={data.qrImageDataUrl} download="qr-resenas-electron-plus.png">
                <Download className="h-4 w-4" /> PNG
              </a>
            </Button>
          ) : (
            <Button variant="outline" className="gap-1.5" disabled>
              <Download className="h-4 w-4" /> PNG
            </Button>
          )}
          <Button
            className="gap-1.5 bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!data}
            onClick={() => data && printSign(data.qrImageDataUrl, data.url)}
          >
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EditableSource = { key: string; id?: string; label: string };

function SourcesDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: [...reviewsKey, "settings"],
    queryFn: () => apiFetch<{ sources: ReviewSource[] }>("/reviews/settings"),
  });
  // The saved list until the first edit; the edited copy after.
  const [edited, setEdited] = useState<EditableSource[] | null>(null);
  const items =
    edited ?? data?.sources.map((s) => ({ key: s.id, id: s.id, label: s.label })) ?? null;
  const change = (next: (list: EditableSource[]) => EditableSource[]) =>
    items && setEdited(next(items));

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/reviews/settings", {
        method: "PUT",
        body: { sources: (items ?? []).map(({ id, label }) => ({ id, label })) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewsKey });
      toast.success("Opciones guardadas");
      onClose();
    },
    onError: reportError,
  });

  const update = (index: number, label: string) =>
    change((list) => list.map((item, i) => (i === index ? { ...item, label } : item)));
  const move = (index: number, delta: number) =>
    change((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  const remove = (index: number) => change((list) => list.filter((_, i) => i !== index));
  const add = () => change((list) => [...list, { key: `nueva-${Date.now()}`, label: "" }]);

  const valid = Boolean(items?.length) && items!.every((item) => item.label.trim());

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opciones de "¿Cómo llegaste?"</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Lo que el cliente puede elegir, en este orden. "Otro" siempre aparece al final, con un
          espacio para escribir. Cambiarle el nombre a una opción no separa sus reseñas anteriores.
        </p>
        {isLoading || !items ? (
          <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={item.key} className="flex items-center gap-1.5">
                <Input
                  value={item.label}
                  onChange={(e) => update(index, e.target.value)}
                  maxLength={60}
                  placeholder="Nombre de la opción"
                  aria-label={`Opción ${index + 1}`}
                  autoFocus={!item.id && !item.label}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Subir"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Bajar"
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={items.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              Otro <span className="text-xs">(fija, con texto)</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={items.length >= 20}
              onClick={add}
            >
              <Plus className="h-4 w-4" /> Agregar opción
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
