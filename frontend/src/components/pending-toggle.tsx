import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Month-by-month lists would hide work still waiting from an earlier month
 * (a payment to verify, a quote to answer). This switches the list to every
 * such item regardless of month — a small, bounded set, since items leave
 * it once handled. Hidden while there's nothing pending.
 */
export function PendingToggle({
  label,
  count,
  active,
  onToggle,
}: {
  label: string;
  count: number | undefined;
  active: boolean;
  onToggle: () => void;
}) {
  if (!active && !count) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "h-9 gap-2 border-brand-yellow text-brand-navy",
        active
          ? "bg-brand-yellow hover:bg-brand-yellow/90"
          : "bg-brand-yellow/10 hover:bg-brand-yellow/20",
      )}
    >
      <AlertCircle className="h-4 w-4" />
      {label}
      <span className="rounded-full bg-brand-navy/10 px-1.5 text-xs font-semibold tabular-nums">
        {count ?? 0}
      </span>
    </Button>
  );
}
