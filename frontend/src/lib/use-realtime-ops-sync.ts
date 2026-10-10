import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { API_ORIGIN } from "./api-client";
import { auth } from "./firebase";
import { useElectronStore } from "./electron-store";
import { SECOND_STORE_PRODUCTS_KEY } from "./second-store";

const STOCK_REFRESH_SETTLE_MS = 1500;

export const NOTIFICATIONS_KEY = ["admin", "notifications"];

/** Matches the backend's list limit (notifications.service.ts). */
const NOTIFICATIONS_LIST_LIMIT = 50;

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

    // The push carries the whole notification, so it goes straight into the
    // bell's list — refetching would re-read every listed doc for one new one.
    const addNotification = (notification: { id: string }) =>
      queryClient.setQueryData<{ id: string }[]>(NOTIFICATIONS_KEY, (current) =>
        current
          ? [notification, ...current.filter((n) => n.id !== notification.id)].slice(
              0,
              NOTIFICATIONS_LIST_LIMIT,
            )
          : current,
      );

    const invalidateStock = () => {
      // Prefix match — covers every ["admin","products",search] variant
      // (admin.inventory/.index/.stock/.suppliers/.labels all share it)
      // and the second-store catalog, wherever either is currently mounted.
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: SECOND_STORE_PRODUCTS_KEY });
      // Covers product.$id.tsx: its stock figure comes from the route
      // loader, not a React Query cache, so it needs the router's own
      // invalidation to refetch — same call the root error screen's
      // "Reintentar" button already uses (see __root.tsx).
      void router.invalidate();
    };

    // One ERP sync run can move stock on hundreds of products, each its own
    // stock.changed event. Refetching per event re-downloaded both admin
    // catalogs hundreds of times in a few seconds — wait for the burst to
    // settle and refetch once.
    let stockRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleStockRefresh = () => {
      clearTimeout(stockRefreshTimer);
      stockRefreshTimer = setTimeout(invalidateStock, STOCK_REFRESH_SETTLE_MS);
    };

    void (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token || cancelled) return;
      socket = io(`${API_ORIGIN}/realtime`, {
        // A function, so every reconnect sends a current token — the one
        // from page load expires after an hour and the server would turn
        // the reconnect away, leaving the tab without live updates.
        auth: (cb) => {
          void auth.currentUser?.getIdToken().then((fresh) => cb({ token: fresh ?? token }));
        },
        transports: ["websocket"],
      });
      socket.on("notification.created", addNotification);
      socket.on("stock.changed", scheduleStockRefresh);
      // Catch-up on reconnect instead of polling on a timer. Socket.IO
      // reconnects on its own, and any stock.changed emitted while the
      // connection was down was missed — one invalidation on `reconnect`
      // closes that gap exactly when it matters.
      //
      // Deliberately NOT a setInterval: invalidateStock re-downloads the
      // admin catalogs (thousands of rows), so an unconditional timer would
      // cost that per tick for every ops user with a tab open, whether or
      // not anything actually changed.
      socket.io.on("reconnect", () => {
        invalidateStock();
        void invalidateNotifications();
      });
    })();

    return () => {
      cancelled = true;
      clearTimeout(stockRefreshTimer);
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOps, queryClient]);
}
