import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { Bell, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch, API_ORIGIN, reportError } from "@/lib/api-client";
import { auth } from "@/lib/firebase";
import { formatDate } from "@/lib/format";

type NotificationType =
  "low_stock" | "out_of_stock" | "invoice_due_soon" | "invoice_overdue" | "sync_error";

interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const NOTIFICATIONS_KEY = ["admin", "notifications"];

/** Where clicking a notification should take the admin — the screen that
 * actually shows what triggered it, not just wherever they happened to be. */
function targetFor(notification: AppNotification): string {
  switch (notification.type) {
    case "low_stock":
    case "out_of_stock":
      return "/admin/stock";
    case "invoice_due_soon":
    case "invoice_overdue":
      return "/admin/purchases";
    case "sync_error":
      return "/admin/settings?tab=erp-sync";
  }
}

function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => apiFetch<AppNotification[]>("/notifications"),
    // The realtime socket below invalidates this on every push — this
    // interval is just a fallback in case a connection ever drops silently.
    refetchInterval: 60_000,
  });
}

/**
 * Backend side of this (notifications.gateway.ts) has been fully built and
 * broadcasting stock-alert / invoice-due / sync-error events for a while —
 * this is the first UI that actually shows them. Connects to the same
 * Socket.IO `realtime` namespace/room-per-role scheme the gateway already
 * implements, rather than polling alone, so alerts show up live.
 */
export function NotificationBell() {
  const { data: notifications } = useNotifications();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const unread = notifications?.filter((n) => !n.read) ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

  useEffect(() => {
    let socket: Socket | undefined;
    let cancelled = false;

    void (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token || cancelled) return;
      socket = io(`${API_ORIGIN}/realtime`, {
        auth: { token },
        transports: ["websocket"],
      });
      socket.on("notification.created", invalidate);
      socket.on("stock.changed", invalidate);
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/notifications/read-all", { method: "PATCH" }),
    onSuccess: invalidate,
    onError: reportError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: reportError,
  });

  const openNotification = (notification: AppNotification) => {
    if (!notification.read) markRead.mutate(notification.id);
    navigate({ to: targetFor(notification) });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <span className="text-sm font-semibold text-brand-navy">Notificaciones</span>
          {unread.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 px-1.5 py-1 text-xs text-brand-blue hover:text-brand-blue"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              <Check className="h-3 w-3" /> Marcar todas como vistas
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(!notifications || notifications.length === 0) && (
            <div className="p-4 text-center text-sm text-muted-foreground">Sin notificaciones</div>
          )}
          {notifications?.map((n) => (
            <div
              key={n.id}
              className={`group flex items-start gap-1 border-b border-border text-sm last:border-0 hover:bg-brand-surface ${
                n.read ? "" : "bg-brand-blue/5"
              }`}
            >
              <button
                type="button"
                onClick={() => openNotification(n)}
                className="min-w-0 flex-1 p-3 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-brand-navy">{n.title}</div>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-blue" />
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{n.message}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {formatDate(n.createdAt)}
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="mr-1 mt-1 h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                aria-label="Eliminar notificación"
                disabled={remove.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  remove.mutate(n.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
