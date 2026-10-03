import { useMemo, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Client-side paging over a list that's already loaded. For lists served from
 * a snapshot or already narrowed to one month by the server, moving between
 * pages costs no request at all.
 *
 * `resetKey` is anything that changes when the list's filters change (a
 * search string, a status) — the page snaps back to 1 when it does, without
 * an effect. Pass the same key you filter with.
 */
export function usePagination<T>(items: readonly T[] | undefined, pageSize: number, resetKey = "") {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const total = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requested = state.key === resetKey ? state.page : 1;
  const page = Math.min(Math.max(1, requested), totalPages);
  const start = (page - 1) * pageSize;

  const pageItems = useMemo(
    () => (items ?? []).slice(start, start + pageSize),
    [items, start, pageSize],
  );

  return {
    page,
    totalPages,
    total,
    pageItems,
    /** 1-based, inclusive — for "Mostrando 26–50 de 120". */
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    setPage: (next: number) => setState({ key: resetKey, page: next }),
  };
}

type PageSlot = number | "gap-start" | "gap-end";

/** First, last, and the current page with its neighbours — a 300-page list
 * shows 1 … 41 42 43 … 300 instead of 300 buttons. */
export function pageWindow(page: number, totalPages: number, siblings = 1): PageSlot[] {
  const slots: PageSlot[] = [];
  const startPage = Math.max(2, page - siblings);
  const endPage = Math.min(totalPages - 1, page + siblings);
  slots.push(1);
  if (startPage > 2) slots.push("gap-start");
  for (let p = startPage; p <= endPage; p++) slots.push(p);
  if (endPage < totalPages - 1) slots.push("gap-end");
  if (totalPages > 1) slots.push(totalPages);
  return slots;
}

export function PaginationBar({
  page,
  totalPages,
  onChange,
  from,
  to,
  total,
  scrollAnchor,
  isPageReachable = () => true,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** With all three, shows "Mostrando 26–50 de 120". */
  from?: number;
  to?: number;
  total?: number;
  /** Scrolled back into view on a page change when it's above the screen —
   * the bar sits under the list, so the new page would otherwise start
   * off-screen. */
  scrollAnchor?: RefObject<HTMLElement | null>;
  /** For server pages fetched by cursor: only pages whose starting cursor is
   * already known can be opened directly. */
  isPageReachable?: (page: number) => boolean;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const go = (next: number) => {
    onChange(next);
    const anchor = scrollAnchor?.current;
    // scroll-margin-top doubles as "where a sticky header ends".
    const margin = anchor ? parseFloat(getComputedStyle(anchor).scrollMarginTop) || 0 : 0;
    if (anchor && anchor.getBoundingClientRect().top < margin) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      anchor.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    }
  };

  return (
    <nav
      aria-label="Paginación"
      className={cn("flex flex-wrap items-center justify-center gap-3", className)}
    >
      {total !== undefined && from !== undefined && to !== undefined && (
        <p className="text-xs tabular-nums text-muted-foreground">
          Mostrando {from}–{to} de {total.toLocaleString("es-VE")}
        </p>
      )}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pageWindow(page, totalPages).map((slot) =>
          typeof slot === "number" ? (
            <Button
              key={slot}
              variant={slot === page ? "default" : "outline"}
              size="icon"
              disabled={slot !== page && !isPageReachable(slot)}
              onClick={() => go(slot)}
              aria-label={`Página ${slot}`}
              aria-current={slot === page ? "page" : undefined}
              className={cn(
                "tabular-nums",
                slot === page && "bg-brand-blue text-white hover:bg-brand-blue/90",
              )}
            >
              {slot}
            </Button>
          ) : (
            <span key={slot} aria-hidden className="w-6 text-center text-muted-foreground">
              …
            </span>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages || !isPageReachable(page + 1)}
          onClick={() => go(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
