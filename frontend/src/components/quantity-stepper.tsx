import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Agregar" button while qty is 0; becomes a [-] qty [+] stepper once
 * something's added. Decrementing to 0 reverts to the button.
 */
export function QuantityStepper({
  qty,
  onChange,
  disabled,
  fullWidth,
  addLabel = "Agregar",
  size = "default",
}: {
  qty: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
  fullWidth?: boolean;
  addLabel?: string;
  size?: "sm" | "default";
}) {
  if (qty <= 0) {
    return (
      <Button
        size="sm"
        className={cn(
          "gap-2 bg-brand-blue text-white hover:bg-brand-blue/90",
          fullWidth && "w-full",
        )}
        disabled={disabled}
        onClick={() => onChange(1)}
      >
        <ShoppingCart className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    );
  }

  const buttonSize = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border",
        fullWidth && "w-full justify-between",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(qty - 1)}
        className={cn(
          "grid shrink-0 place-items-center hover:bg-brand-surface disabled:pointer-events-none disabled:opacity-50",
          buttonSize,
        )}
        aria-label="Restar"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(qty + 1)}
        className={cn(
          "grid shrink-0 place-items-center hover:bg-brand-surface disabled:pointer-events-none disabled:opacity-50",
          buttonSize,
        )}
        aria-label="Sumar"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
