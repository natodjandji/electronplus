import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { API_ORIGIN } from "./api-client";
import { auth } from "./firebase";
import { useElectronStore } from "./electron-store";

export const NOTIFICATIONS_KEY = ["admin", "notifications"];

/**
 * One Socket.IO connection to the backend's `/realtime` namespace
 * (notifications.gateway.ts), shared by every ops-role page — not just
 * screens under AdminShell. Stock changes fire on every sale, manual
 * adjustment, and ERP sync (see products.service.ts's STOCK_CHANGED_EVENT),
 * so an admin/almacenista reading a product's stock anywhere — including
 * the public product detail page's "Información interna" panel, which
 * lives outside AdminShell — needs it live, not just whatever the page
 * happened to fetch on mount.
 *
 * Previously this lived inside NotificationBell (AdminShell-only), which
 * meant `stock.changed` events never reached product.$id.tsx at all: the
 * socket simply wasn't connected there. Mounted once at the app root
 * instead (see __root.tsx), gated on isOps so regular customers never open
 * this connection.
 */
export function useRealtimeOpsSync() {
  const { isOps } = useElectronStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!isOps) return;

    let socket: Socket | undefined;
    let cancelled = false;

    const invalidateNotifications = () =>
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

    const invalidateStock = () => {
      // Prefix match — covers every ["admin","products",search] variant
      // (admin.inventory/.index/.stock/.suppliers/.labels all share it)
      // and the second-store catalog, wherever either is currently mounted.
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "second-store-products"] });
      // Covers product.$id.tsx: its stock figure comes from the route
      // loader, not a React Query cache, so it needs the router's own
      // invalidation to refetch — same call the root error screen's
      // "Reintentar" button already uses (see __root.tsx).
      void router.invalidate();
    };

    void (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token || cancelled) return;
      socket = io(`${API_ORIGIN}/realtime`, {
        auth: { token },
        transports: ["websocket"],
      });
      socket.on("notification.created", invalidateNotifications);
      socket.on("stock.changed", invalidateStock);
      // Catch-up on reconnect instead of polling on a timer. Socket.IO
      // reconnects on its own, and any stock.changed emitted while the
      // connection was down was missed — one invalidation on `reconnect`
      // closes that gap exactly when it matters.
      //
      // Deliberately NOT a setInterval: invalidateStock refetches the
      // second-store catalog (5k+ docs today), so an unconditional timer
      // would bill a full-collection read per tick for every ops user
      // with a tab open, whether or not anything actually changed.
      socket.io.on("reconnect", invalidateStock);
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOps, queryClient]);
}
