import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch, reportError } from "@/lib/api-client";
import { toast } from "sonner";

type SyncDirection = "inbound" | "outbound";
type SyncStatus = "running" | "success" | "error";

interface SyncLog {
  id: string;
  direction?: SyncDirection;
  status: SyncStatus;
  startedAt: string;
  finishedAt?: string;
  itemsProcessed: number;
  reference?: string;
  error?: string;
}

interface SyncStatusResponse {
  lastInbound: SyncLog | null;
  adapterHealthy: boolean;
}

const STATUS_LABEL: Record<SyncStatus, string> = {
  running: "En curso",
  success: "Exitosa",
  error: "Con error",
};

const STATUS_BADGE: Record<SyncStatus, string> = {
  running: "bg-brand-yellow text-brand-navy",
  success: "bg-emerald-100 text-emerald-800",
  error: "bg-destructive text-white",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Generic status+history panel for one ERP sync engine. The principal and
 * secundaria stores each get their own instance of this (see below) — they
 * point at different API paths because they're genuinely two different
 * Profit Plus servers in two different physical locations, so one being
 * reachable says nothing about the other. Never merge them into a single
 * combined status.
 */
function SyncStatusPanel({
  title,
  description,
  statusPath,
  logsPath,
  triggerPath,
  queryKeyPrefix,
  showDirectionColumn = false,
}: {
  title: string;
  description: string;
  statusPath: string;
  logsPath: string;
  triggerPath: string;
  queryKeyPrefix: string;
  showDirectionColumn?: boolean;
}) {
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["admin", queryKeyPrefix, "status"],
    queryFn: () => apiFetch<SyncStatusResponse>(statusPath),
    // The inbound sync runs on its own cron every ~15 min — poll so a
    // stuck/failed run shows up here without needing a manual refresh.
    refetchInterval: 30_000,
  });
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["admin", queryKeyPrefix, "logs"],
    queryFn: () => apiFetch<SyncLog[]>(logsPath),
    refetchInterval: 30_000,
  });

  const trigger = useMutation({
    mutationFn: () => apiFetch(triggerPath, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", queryKeyPrefix] });
      toast.success("Sincronización con Profit Plus completada");
    },
    onError: reportError,
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          className="shrink-0 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending}
        >
          {trigger.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sincronizar ahora
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div
              className={`grid h-10 w-10 place-items-center rounded-md ${
                status?.adapterHealthy
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-destructive/15 text-destructive"
              }`}
            >
              {status?.adapterHealthy ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                Conexión con Profit Plus
              </div>
              <div className="text-sm font-semibold text-brand-navy">
                {statusLoading
                  ? "Verificando…"
                  : status?.adapterHealthy
                    ? "Activa"
                    : "Sin conexión"}
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-medium text-muted-foreground">Última sincronización</div>
          {status?.lastInbound ? (
            <div className="mt-1 flex items-center gap-2">
              <Badge className={STATUS_BADGE[status.lastInbound.status]}>
                {STATUS_LABEL[status.lastInbound.status]}
              </Badge>
              <span className="text-sm text-brand-navy">
                {formatDateTime(status.lastInbound.startedAt)}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">Aún no se ha ejecutado.</div>
          )}
          {status?.lastInbound?.status === "success" && (
            <p className="mt-1 text-xs text-muted-foreground">
              {status.lastInbound.itemsProcessed} producto(s) procesado(s)
            </p>
          )}
          {status?.lastInbound?.status === "error" && status.lastInbound.error && (
            <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {status.lastInbound.error}
            </p>
          )}
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-border bg-brand-surface px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Últimas 5 corridas
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Fecha</th>
                {showDirectionColumn && <th className="px-4 py-2">Dirección</th>}
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Ítems</th>
              </tr>
            </thead>
            <tbody>
              {!logsLoading && (logs?.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={showDirectionColumn ? 4 : 3}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Sin corridas registradas.
                  </td>
                </tr>
              )}
              {logs?.map((log) => (
                <tr key={log.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-brand-navy">{formatDateTime(log.startedAt)}</td>
                  {showDirectionColumn && (
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {log.direction === "inbound" ? "Entrante" : "Saliente"}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <Badge className={STATUS_BADGE[log.status]}>{STATUS_LABEL[log.status]}</Badge>
                    {log.status === "error" && log.error && (
                      <div className="mt-1 max-w-xs text-xs text-destructive">{log.error}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-brand-navy">{log.itemsProcessed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function ErpSyncPanel() {
  return (
    <SyncStatusPanel
      title="Tienda principal"
      description="Sincronización automática de inventario con el Profit Plus de la tienda principal (cada 15 minutos) y su historial de corridas."
      statusPath="/erp-sync/status"
      logsPath="/erp-sync/logs"
      triggerPath="/erp-sync/trigger"
      queryKeyPrefix="erp-sync"
      showDirectionColumn
    />
  );
}

export function SecondStoreSyncPanel() {
  return (
    <SyncStatusPanel
      title="Tienda secundaria"
      description="Sincronización automática del catálogo con el Profit Plus de la tienda secundaria (cada 30 minutos) — un servidor distinto, en una ubicación distinta al de la tienda principal."
      statusPath="/second-store-products/sync/status"
      logsPath="/second-store-products/sync/logs"
      triggerPath="/second-store-products/sync/trigger"
      queryKeyPrefix="second-store-sync"
    />
  );
}
