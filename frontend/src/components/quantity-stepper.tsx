import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Agregar" button while qty is 0; becomes a [-] qty [+] stepper once
 * something's added. Decrementing to 0 reverts to the button. The qty in
 * the middle is directly editable — type a value and it's clamped to
 * [0, max] on blur/Enter. Optional `max` (e.g. available stock) caps both
 * the typed value and the +/- buttons.
 */
export function QuantityStepper({
  qty,
  onChange,
  disabled,
  fullWidth,
  addLabel = "Agregar",
  showIcon = true,
  size = "default",
  max,
}: {
  qty: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
  fullWidth?: boolean;
  addLabel?: string;
  showIcon?: boolean;
  size?: "sm" | "default";
  max?: number;
}) {
  const [inputValue, setInputValue] = useState(String(qty));

  useEffect(() => {
    setInputValue(String(qty));
  }, [qty]);

  const clamp = (n: number) => {
    const whole = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
    return max !== undefined ? Math.min(whole, max) : whole;
  };

  const atMax = max !== undefined && qty >= max;

  if (qty <= 0) {
    return (
      <Button
        size="sm"
        className={cn(
          "gap-2 bg-brand-blue text-white hover:bg-brand-blue/90",
          fullWidth && "w-full",
        )}
        disabled={disabled || max === 0}
        onClick={() => onChange(clamp(1))}
      >
        {showIcon && <ShoppingCart className="h-3.5 w-3.5" />}
        {addLabel}
      </Button>
    );
  }

  const buttonSize = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  const commit = (raw: string) => {
    const next = clamp(Number(raw));
    setInputValue(String(next));
    if (next !== qty) onChange(next);
  };

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
        onClick={() => onChange(clamp(qty - 1))}
        className={cn(
          "grid shrink-0 place-items-center hover:bg-brand-surface disabled:pointer-events-none disabled:opacity-50",
          buttonSize,
        )}
        aria-label="Restar"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={inputValue}
        disabled={disabled}
        onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          }
        }}
        aria-label="Cantidad"
        className="w-8 shrink-0 border-0 bg-transparent text-center text-sm font-semibold tabular-nums outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-50"
      />
      <button
        type="button"
        disabled={disabled || atMax}
        onClick={() => onChange(clamp(qty + 1))}
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
