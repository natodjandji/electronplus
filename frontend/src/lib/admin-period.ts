import { useQuery } from "@tanstack/react-query";
import type { MonthPeriod } from "@/components/month-pager";
import { apiFetch } from "./api-client";

/** `from`/`to` for a month view — `timestamp` for createdAt-style fields,
 * `date` for YYYY-MM-DD due dates. The server then reads only that month's
 * documents. */
export function periodQuery(period: MonthPeriod, kind: "timestamp" | "date"): string {
  const range =
    kind === "timestamp"
      ? { from: period.from, to: period.to }
      : { from: period.fromDate, to: period.toDate };
  return new URLSearchParams(range).toString();
}

/** Orders awaiting the admin — shown regardless of month (see PendingToggle). */
export const ORDERS_NEEDING_ACTION = ["pending_payment_verification"];

// Shared with the dashboard (admin.index.tsx), which shows this month's count
// and the pending count from the same cache entries.
export function useOrdersOfMonth<T>(period: MonthPeriod) {
  return useQuery({
    queryKey: ["admin", "orders", "month", period.key],
    queryFn: () => apiFetch<T[]>(`/orders?${periodQuery(period, "timestamp")}`),
  });
}

export function useOrdersNeedingAction<T>() {
  return useQuery({
    queryKey: ["admin", "orders", "pending"],
    queryFn: () => apiFetch<T[]>(`/orders?status=${ORDERS_NEEDING_ACTION.join(",")}`),
  });
}
