import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  PlugZap,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { PaginationBar, usePagination } from "@/components/pagination";
import { CardListSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiFetch, reportError } from "@/lib/api-client";
import { formatMoneyAdmin } from "@/lib/electron-store";
import {
  LISTING_TYPES,
  TRIAL_BATCH,
  downloadMercasistExcel,
  mercadoLibreSaleUrl,
  mercasistKey,
  type MercasistChange,
  type MercasistExportSummary,
  type MercasistPublicationRow,
  type MercasistRunResult,
  type MercasistSale,
  type MercasistStatus,
  type MercasistSyncSummary,
} from "@/lib/mercasist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/mercasist")({
  head: () => ({
    meta: [
      { title: "Mercado Libre · Admin Electron Plus" },
      {
        name: "description",
        content: "Publicaciones, precios, stock y ventas de Mercado Libre a través de Mercasist.",
      },
    ],
  }),
  component: MercasistPage,
});

const statusKey = [...mercasistKey, "status"] as const;
const exportKey = [...mercasistKey, "export"] as const;
const publicationsKey = [...mercasistKey, "publications"] as const;
const salesKey = [...mercasistKey, "sales"] as const;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-VE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function summaryText(s: MercasistSyncSummary) {
  const parts = [
    s.updated && `${s.updated} actualizadas`,
    s.paused && `${s.paused} pausadas`,
    s.activated && `${s.activated} reactivadas`,
    s.failed && `${s.failed} con error`,
    s.deferred && `${s.deferred} para la próxima`,
    s.newSales && `${s.newSales} ventas nuevas`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Todo estaba al día";
}

function MercasistPage() {
  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => apiFetch<MercasistStatus>("/mercasist/status"),
  });

  return (
    <AdminShell title="Mercado Libre">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Las publicaciones de Mercado Libre se manejan en{" "}
        <a
          href="https://mercasist.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand-blue underline-offset-2 hover:underline"
        >
          Mercasist
        </a>
        . La web le envía a cada publicación el precio (detal con IVA, en dólares) y el stock de
        Profit, buscándola por su SKU, y te avisa por correo de cada venta.
      </p>

      {status.isLoading && (
        <div className="mt-6">
          <CardListSkeleton rows={2} />
        </div>
      )}
      {status.data && (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {status.data.configured ? <SyncCard status={status.data} /> : <SetupCard />}
          <PublishCard status={status.data} />
        </div>
      )}
      {status.data?.configured && (
        <>
          <PublicationsCard />
          <SalesCard since={status.data.salesSince} />
        </>
      )}
    </AdminShell>
  );
}

function SetupCard() {
  const steps = [
    <>
      Crea la cuenta de la tienda en{" "}
      <a
        href="https://mercasist.com"
        target="_blank"
        rel="noreferrer"
        className="text-brand-blue underline-offset-2 hover:underline"
      >
        mercasist.com
      </a>{" "}
      (tiene 15 días de prueba).
    </>,
    <>
      En Mercasist, asocia la cuenta de Mercado Libre de la tienda:{" "}
      <strong>Configuración → Cuentas MercadoLibre → Asociar cuenta</strong>.
    </>,
    <>
      Copia el token de la API: <strong>menú de usuario → Token de API → Copiar</strong>. Trátalo
      como una contraseña: no lo mandes por chat ni por correo.
    </>,
    <>
      Guárdalo en el servidor como el secreto <code>mercasist-api-token</code> (Secret Manager de
      Google Cloud). Con eso esta página muestra la conexión y la sincronización.
    </>,
  ];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <PlugZap className="h-5 w-5 text-brand-blue" />
        <h2 className="font-semibold text-brand-navy">Conectar con Mercasist</h2>
      </div>
      <ol className="mt-4 space-y-3 text-sm">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-yellow text-xs font-bold text-brand-navy">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        Mientras tanto ya puedes preparar el Excel de publicación (a la derecha).
      </p>
    </Card>
  );
}

function useSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<MercasistStatus>) =>
      apiFetch<MercasistStatus>("/mercasist/settings", { method: "PUT", body: patch }),
    onSuccess: (data) => {
      queryClient.setQueryData(statusKey, data);
      queryClient.invalidateQueries({ queryKey: exportKey });
    },
    onError: reportError,
  });
}

function SyncCard({ status }: { status: MercasistStatus }) {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const [safety, setSafety] = useState(String(status.safetyStock));
  const [preview, setPreview] = useState<MercasistRunResult | null>(null);

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: mercasistKey });

  const test = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; activePublications: number }>("/mercasist/test", { method: "POST" }),
    onSuccess: (r) =>
      toast.success(
        `Conexión correcta: ${r.activePublications} publicaciones activas en Mercasist.`,
      ),
    onError: reportError,
  });
  const runPreview = useMutation({
    mutationFn: () => apiFetch<MercasistRunResult>("/mercasist/preview", { method: "POST" }),
    onSuccess: (r) => {
      setPreview(r);
      refreshAll();
    },
    onError: reportError,
  });
  const runSync = useMutation({
    mutationFn: () => apiFetch<MercasistRunResult>("/mercasist/sync", { method: "POST" }),
    onSuccess: (r) => {
      if (r.skipped) toast.info(r.skipped);
      else toast.success(summaryText(r.summary));
      refreshAll();
    },
    onError: reportError,
  });

  const saveSafety = () => {
    const value = Math.max(0, Math.floor(Number(safety)));
    if (!Number.isFinite(value) || value === status.safetyStock) {
      setSafety(String(status.safetyStock));
      return;
    }
    settings.mutate({ safetyStock: value });
  };

  const last = status.lastSync;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold text-brand-navy">Conectado a Mercasist</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlugZap className="h-4 w-4" />
          )}
          Probar conexión
        </Button>
      </div>

      <div className="mt-5 space-y-4">
        <SettingRow
          title="Sincronizar automáticamente"
          hint="Cada 30 minutos la web actualiza las publicaciones en Mercado Libre. Antes de activarlo, revisa la vista previa."
          checked={status.enabled}
          disabled={settings.isPending}
          onChange={(enabled) => settings.mutate({ enabled })}
        />
        <SettingRow
          title="Precio"
          hint="Detal con IVA, en dólares."
          checked={status.syncPrice}
          disabled={settings.isPending}
          onChange={(syncPrice) => settings.mutate({ syncPrice })}
        />
        <SettingRow
          title="Stock"
          hint="El de Profit, menos lo vendido en Mercado Libre en los últimos 3 días que aún no se factura."
          checked={status.syncStock}
          disabled={settings.isPending}
          onChange={(syncStock) => settings.mutate({ syncStock })}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brand-navy">Stock de seguridad</p>
            <p className="text-xs text-muted-foreground">
              Unidades que no se publican, para no vender dos veces la última.
            </p>
          </div>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            aria-label="Stock de seguridad"
            className="w-24 text-right"
            value={safety}
            onChange={(e) => setSafety(e.target.value)}
            onBlur={saveSafety}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="gap-2"
          disabled={runPreview.isPending || runSync.isPending}
          onClick={() => runPreview.mutate()}
        >
          {runPreview.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          Vista previa
        </Button>
        <Button
          className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          disabled={!status.enabled || runSync.isPending || runPreview.isPending}
          onClick={() => runSync.mutate()}
        >
          {runSync.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sincronizar ahora
        </Button>
      </div>

      <div className="mt-4 rounded-lg bg-brand-surface px-4 py-3 text-sm">
        {last ? (
          <>
            <p className="text-brand-navy">
              <span className="font-medium">Última sincronización</span> · {formatDateTime(last.at)}
            </p>
            <p className="mt-1 text-muted-foreground">
              {last.matched} de {last.publications} publicaciones con su producto en la web ·{" "}
              {summaryText(last)}
            </p>
            {last.errors && last.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-destructive">
                {last.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.sku}</span>: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">Todavía no se ha sincronizado.</p>
        )}
        {status.quota?.remainingDay !== undefined && (
          <p className="mt-1 text-xs text-muted-foreground">
            Quedan {status.quota.remainingDay.toLocaleString("es-VE")} solicitudes de Mercasist por
            hoy.
          </p>
        )}
      </div>

      {preview && <PreviewDialog result={preview} onClose={() => setPreview(null)} />}
    </Card>
  );
}

function SettingRow({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-brand-navy">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch aria-label={title} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

/** A price as Mercasist shows it: dollars, or its own symbol (e.g. "Bs"). */
function currentPrice(price: number | null, currency?: string) {
  if (price === null) return "—";
  if (!currency || /u\$s|us\$|usd|^\$$/i.test(currency)) return formatMoneyAdmin(price);
  return `${currency} ${price.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`;
}

function changeText(change: MercasistChange) {
  const { body, current } = change;
  const parts: string[] = [];
  if (body.precio !== undefined) {
    parts.push(
      `Precio ${currentPrice(current.price, current.currency)} → ${formatMoneyAdmin(body.precio)}`,
    );
  }
  if (body.disponibilidad !== undefined) {
    parts.push(`Stock ${current.stock ?? "—"} → ${body.disponibilidad}`);
  }
  if (body.status === "Pausado") parts.push("Se pausa");
  if (body.status === "Activo") parts.push("Se reactiva");
  return parts.join(" · ");
}

function PreviewDialog({ result, onClose }: { result: MercasistRunResult; onClose: () => void }) {
  const changes = result.changes ?? [];
  const { summary } = result;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vista previa</DialogTitle>
          <DialogDescription>
            {result.skipped ??
              `${summary.matched} de ${summary.publications} publicaciones tienen su producto en la web. ${
                summary.deferred === 0
                  ? "Ninguna necesita cambios."
                  : `Una sincronización cambiaría ${summary.deferred}${
                      summary.deferred > changes.length
                        ? ` (se muestran las primeras ${changes.length})`
                        : ""
                    }.`
              } Nada se cambió en Mercado Libre.`}
          </DialogDescription>
        </DialogHeader>
        {changes.length > 0 && (
          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {changes.map((c) => (
              <li key={c.publicationId} className="px-3 py-2">
                <p className="truncate font-medium text-brand-navy" title={c.title}>
                  {c.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{c.sku}</span> · {changeText(c)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PublishCard({ status }: { status: MercasistStatus }) {
  const settings = useSettings();
  const summary = useQuery({
    queryKey: exportKey,
    queryFn: () => apiFetch<MercasistExportSummary>("/mercasist/export/summary"),
  });
  const [inBatches, setInBatches] = useState(true);
  const [lote, setLote] = useState(1);
  const download = useMutation({
    mutationFn: () =>
      inBatches ? downloadMercasistExcel(lote, TRIAL_BATCH) : downloadMercasistExcel(),
    onError: reportError,
  });

  const ready = summary.data?.ready ?? 0;
  const batches = Math.max(1, Math.ceil(ready / TRIAL_BATCH));
  const batch = Math.min(lote, batches);

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-brand-navy">Publicar productos nuevos</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Mercasist no crea publicaciones por su API: se crean con su publicador masivo, subiendo este
        Excel con los productos de la web que aún no están en Mercado Libre.
      </p>

      {summary.isLoading ? (
        <div className="mt-4">
          <CardListSkeleton rows={1} />
        </div>
      ) : (
        summary.data && (
          <div className="mt-4 space-y-1 text-sm">
            <p className="text-brand-navy">
              <span className="text-2xl font-bold tabular-nums">{ready}</span> productos listos para
              publicar
              {summary.data.published > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {summary.data.published} ya están en Mercado Libre
                </span>
              )}
            </p>
            {summary.data.blocked.length > 0 && (
              <p className="text-xs text-muted-foreground">
                No entran:{" "}
                {summary.data.blocked
                  .map((b) => `${b.reason.toLowerCase()} (${b.count})`)
                  .join(", ")}
                .
              </p>
            )}
            {!summary.data.snapshotAt && status.configured && (
              <p className="flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Haz una vista previa primero: así el Excel
                no repite lo que ya está publicado.
              </p>
            )}
          </div>
        )
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-brand-navy">Tipo de publicación</p>
          <Select
            value={status.listingType}
            onValueChange={(listingType) => settings.mutate({ listingType })}
            disabled={settings.isPending}
          >
            <SelectTrigger aria-label="Tipo de publicación">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LISTING_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-brand-navy">Archivo</p>
          <Select
            value={inBatches ? String(batch) : "all"}
            onValueChange={(v) => {
              setInBatches(v !== "all");
              if (v !== "all") setLote(Number(v));
            }}
          >
            <SelectTrigger aria-label="Archivo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: batches }, (_, i) => (
                <SelectItem key={i} value={String(i + 1)}>
                  Lote {i + 1}: productos {i * TRIAL_BATCH + 1}–
                  {Math.min((i + 1) * TRIAL_BATCH, Math.max(ready, 1))}
                </SelectItem>
              ))}
              <SelectItem value="all">Todos en un archivo ({ready})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        El nombre y la comisión de cada tipo están en Mercasist → Publicación masiva → Herramientas
        → Tipos de publicación. En el período de prueba Mercasist acepta 20 productos por archivo.
      </p>

      <Button
        className="mt-4 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
        disabled={ready === 0 || download.isPending}
        onClick={() => download.mutate()}
      >
        {download.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Descargar Excel
      </Button>

      <details className="mt-4 rounded-lg bg-brand-surface px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-brand-navy">
          Cómo subirlo en Mercasist
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Publicaciones → Publicación masiva → Nueva carga → Carga MercadoLibre.</li>
          <li>Sube el Excel y elige la cuenta de Mercado Libre de la tienda.</li>
          <li>
            Asigna cada columna a su campo: tienen los mismos nombres (Título, Descripción, Precio,
            Cantidad, Condición, Imágenes, Tipo de publicación, Moneda, SKU, Atributos).
          </li>
          <li>
            Revisa: la fila 1 sale como error porque es el encabezado, es normal. Si una categoría
            pide más atributos, Mercasist lo dice ahí.
          </li>
          <li>Ejecuta. Después haz una vista previa aquí para que la web las reconozca.</li>
        </ol>
      </details>
    </Card>
  );
}

const ROW_FILTERS: {
  id: string;
  label: string;
  test: (r: MercasistPublicationRow) => boolean;
}[] = [
  { id: "all", label: "Todas", test: () => true },
  { id: "synced", label: "Sincronizadas", test: (r) => Boolean(r.productId) && !r.note },
  { id: "attention", label: "Con aviso", test: (r) => Boolean(r.note) },
];

function PublicationsCard() {
  const publications = useQuery({
    queryKey: publicationsKey,
    queryFn: () =>
      apiFetch<{ at?: string; rows: MercasistPublicationRow[] }>("/mercasist/publications"),
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const test = ROW_FILTERS.find((f) => f.id === filter)!.test;
    return (publications.data?.rows ?? []).filter(
      (r) =>
        test(r) &&
        (!needle ||
          r.title.toLowerCase().includes(needle) ||
          r.sku.toLowerCase().includes(needle) ||
          Boolean(r.product?.name.toLowerCase().includes(needle))),
    );
  }, [publications.data, search, filter]);
  const pagination = usePagination(rows, 20, `${search}:${filter}`);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-brand-navy">Publicaciones</h2>
          <p className="text-xs text-muted-foreground">
            {publications.data?.at
              ? `Como estaban el ${formatDateTime(publications.data.at)}.`
              : "Aparecen después de la primera vista previa o sincronización."}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o SKU"
            aria-label="Buscar publicaciones"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar publicaciones">
        {ROW_FILTERS.map((f) => (
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

      <Card className="mt-3 overflow-hidden">
        {publications.isLoading ? (
          <div className="p-4">
            <CardListSkeleton rows={3} />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {publications.data?.rows.length
              ? "Ninguna publicación con este filtro."
              : "Todavía no hay publicaciones leídas de Mercasist."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm sm:min-w-[640px]">
              <thead className="bg-brand-surface">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2">Publicación</th>
                  <th className="hidden px-4 py-2 text-right sm:table-cell">Precio</th>
                  <th className="hidden px-4 py-2 text-right sm:table-cell">Stock</th>
                  <th className="hidden px-4 py-2 sm:table-cell">Estado</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-1.5">
                        <span className="font-medium text-brand-navy">{r.title}</span>
                        {r.link && (
                          <a
                            href={r.link}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Ver en Mercado Libre"
                            className="mt-0.5 text-muted-foreground hover:text-brand-blue"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{r.sku || "Sin SKU"}</span>
                        {r.note && <span className="text-amber-700"> · {r.note}</span>}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-brand-navy sm:hidden">
                        {r.price === null ? "—" : formatMoneyAdmin(r.price)} · Stock{" "}
                        {r.stock ?? "—"} · {r.status}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                      {r.price === null ? "—" : formatMoneyAdmin(r.price)}
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                      {r.stock ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          r.status === "Activo"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-brand-yellow/25 text-brand-navy",
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <PaginationBar
        className="mt-3"
        page={pagination.page}
        totalPages={pagination.totalPages}
        onChange={pagination.setPage}
        from={pagination.from}
        to={pagination.to}
        total={pagination.total}
      />
    </section>
  );
}

function SalesCard({ since }: { since?: string }) {
  const sales = useQuery({
    queryKey: salesKey,
    queryFn: () => apiFetch<MercasistSale[]>("/mercasist/sales"),
  });
  return (
    <section className="mt-8">
      <h2 className="font-semibold text-brand-navy">Ventas recientes en Mercado Libre</h2>
      <p className="text-xs text-muted-foreground">
        A cada administrador le llega un correo por venta.
        {since && ` Se cuentan desde el ${formatDateTime(since)}.`}
      </p>
      <div className="mt-3 space-y-2">
        {sales.isLoading && <CardListSkeleton rows={2} />}
        {sales.data?.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Todavía no hay ventas nuevas.
          </Card>
        )}
        {sales.data?.map((sale) => (
          <Card key={sale.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium text-brand-navy">
                {sale.items.map((i) => `${i.qty} × ${i.title}`).join(", ")}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(sale.date)}
                {sale.buyer && ` · ${sale.buyer}`} · {sale.status}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold tabular-nums text-brand-navy">
                {sale.currency === "USD"
                  ? formatMoneyAdmin(sale.total)
                  : `Bs ${sale.total.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`}
              </span>
              {sale.idMl && (
                <a
                  href={mercadoLibreSaleUrl(sale.idMl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
                >
                  Ver <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
