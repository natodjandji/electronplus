import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString("es-VE", { month: "long" }),
);

/** How far back the year selector reaches (the arrows can still go further). */
const YEARS_BACK = 5;

export interface MonthPeriod {
  /** YYYY-MM */
  key: string;
  year: number;
  /** 1–12 */
  month: number;
  label: string;
  /** Local-time month bounds as ISO instants, end exclusive — for timestamp
   * fields such as createdAt. */
  from: string;
  to: string;
  /** Calendar-date bounds (YYYY-MM-DD), end exclusive — for date-only fields
   * such as dueDate. */
  fromDate: string;
  toDate: string;
  isCurrent: boolean;
  canGoNext: boolean;
  allowFuture: boolean;
  set: (key: string) => void;
  goPrev: () => void;
  goNext: () => void;
  goCurrent: () => void;
}

/**
 * One month at a time, picked by the admin and sent to the server — which
 * then reads only that month's documents. useMonthPager above instead loads
 * the whole history and filters it in the browser, so its cost grows with
 * every record ever created. `allowFuture` is for lists keyed by a date
 * that's legitimately ahead of today (invoice/expense due dates).
 */
export function useMonthPeriod(options?: { allowFuture?: boolean }): MonthPeriod {
  const allowFuture = options?.allowFuture ?? false;
  const current = monthKey(new Date().toISOString());
  const [key, setKey] = useState(current);
  const clamp = (next: string) => (allowFuture || next <= current ? next : current);

  const [year, month] = key.split("-").map(Number);
  return {
    key,
    year,
    month,
    label: monthLabel(key),
    from: new Date(year, month - 1, 1).toISOString(),
    to: new Date(year, month, 1).toISOString(),
    fromDate: `${key}-01`,
    toDate: `${shiftMonthKey(key, 1)}-01`,
    isCurrent: key === current,
    canGoNext: allowFuture || key < current,
    allowFuture,
    set: (next) => setKey(clamp(next)),
    goPrev: () => setKey((k) => shiftMonthKey(k, -1)),
    goNext: () => setKey((k) => clamp(shiftMonthKey(k, 1))),
    goCurrent: () => setKey(current),
  };
}

export function MonthYearPicker({
  period,
  disabled,
  className,
}: {
  period: MonthPeriod;
  disabled?: boolean;
  className?: string;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = period.allowFuture ? currentYear + 1 : currentYear;
  const years = Array.from(
    { length: lastYear - (currentYear - YEARS_BACK) + 1 },
    (_, i) => lastYear - i,
  );
  if (!years.includes(period.year)) years.push(period.year);
  const latestMonth = !period.allowFuture && period.year === currentYear ? now.getMonth() + 1 : 12;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div
      role="group"
      aria-label="Mes a mostrar"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-white p-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={period.goPrev}
          disabled={disabled}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select
          value={String(period.month)}
          onValueChange={(m) => period.set(`${period.year}-${pad(Number(m))}`)}
          disabled={disabled}
        >
          <SelectTrigger
            aria-label="Mes"
            className="h-8 w-[8.5rem] border-0 capitalize text-brand-navy shadow-none focus:ring-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((name, i) => (
              <SelectItem
                key={name}
                value={String(i + 1)}
                disabled={i + 1 > latestMonth}
                className="capitalize"
              >
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(period.year)}
          onValueChange={(y) => period.set(`${y}-${pad(period.month)}`)}
          disabled={disabled}
        >
          <SelectTrigger
            aria-label="Año"
            className="h-8 w-[5.5rem] border-0 tabular-nums text-brand-navy shadow-none focus:ring-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)} className="tabular-nums">
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={period.goNext}
          disabled={disabled || !period.canGoNext}
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {!period.isCurrent && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={period.goCurrent}
          disabled={disabled}
        >
          Ir al mes actual
        </Button>
      )}
    </div>
  );
}
