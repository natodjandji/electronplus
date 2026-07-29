import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton <tr> rows matching a data table's column count — drop into a
 * loading branch instead of a single "Cargando…" row so the table doesn't
 * jump in height once real rows arrive. */
export function TableRowsSkeleton({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-t border-border">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className="h-4 w-full max-w-[140px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Skeleton cards matching the "list of clickable summary rows" pattern used
 * across most admin list pages (orders, quotes, purchases, invoices…). */
export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mt-6 space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex items-center gap-3">
            <div className="space-y-2 text-right">
              <Skeleton className="ml-auto h-3 w-10" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}
