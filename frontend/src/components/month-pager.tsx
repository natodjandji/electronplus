import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("es-VE", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return monthKey(d.toISOString());
}

/** Filters a history list down to one month at a time so old records
 * don't pile up on screen — "Ver todo" opts back into the full list.
 * `allowFuture` lifts the "can't go past the current month" cap for lists
 * keyed by a date that's legitimately ahead of today (e.g. invoice due
 * dates) instead of a creation date (which never is). */
export function useMonthPager<T>(
  items: T[] | undefined,
  getDate: (item: T) => string,
  options?: { allowFuture?: boolean },
) {
  const allowFuture = options?.allowFuture ?? false;
  const currentMonth = monthKey(new Date().toISOString());
  const [cursorKey, setCursorKey] = useState(currentMonth);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    if (!items) return items;
    if (showAll) return items;
    return items.filter((item) => monthKey(getDate(item)) === cursorKey);
  }, [items, showAll, cursorKey, getDate]);

  return {
    filtered,
    label: monthLabel(cursorKey),
    showAll,
    setShowAll,
    goPrev: () => {
      setShowAll(false);
      setCursorKey((k) => shiftMonthKey(k, -1));
    },
    goNext: () => {
      setShowAll(false);
      setCursorKey((k) => shiftMonthKey(k, 1));
    },
    canGoNext: allowFuture || cursorKey < currentMonth,
  };
}

export function MonthPagerBar({
  label,
  showAll,
  onPrev,
  onNext,
  onToggleAll,
  canGoNext = true,
}: {
  label: string;
  showAll: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleAll: () => void;
  canGoNext?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onPrev}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-32 text-center text-sm font-medium capitalize text-brand-navy">
          {showAll ? "Todo el historial" : label}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onNext}
          disabled={!showAll && !canGoNext}
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onToggleAll}>
        {showAll ? "Filtrar por mes" : "Ver todo el historial"}
      </Button>
    </div>
  );
}
