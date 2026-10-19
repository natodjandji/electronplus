import { Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/electron-store";
import { CASHEA_LOGO_SRC } from "@/lib/cashea";
import { cn } from "@/lib/utils";

/**
 * Cashea's "Continuar con Cashea" button, drawn as its official checkout
 * SDK draws it (dark #303134, 12px radius, its logo, Inter-like semibold
 * label, and the installments line under it) — the checkout itself is
 * created server-side, so this only needs to look and behave like theirs.
 */
export function CasheaButton({
  onClick,
  busy = false,
  disabled = false,
  minAmount,
  label = "Continuar con Cashea",
  className,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  minAmount?: number | null;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("mx-auto flex w-full min-w-0 max-w-[328px] flex-col items-center", className)}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#303134] px-10 py-2.5 text-sm font-semibold leading-[17px] text-white transition-[transform,background-color] duration-150 ease-out hover:bg-[#3d3e42] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
      >
        {busy ? (
          <Loader2 className="h-8 w-8 animate-spin p-1.5" aria-hidden />
        ) : (
          <img src={CASHEA_LOGO_SRC} alt="" className="h-8 w-8" width={32} height={32} />
        )}
        {busy ? "Procesando…" : label}
      </button>
      <span className="mt-2 text-center text-sm font-medium text-[#646A7B]">
        En cuotas sin interés
        {minAmount ? ` · Mínimo de compra de ${formatMoney(minAmount)}` : ""}
      </span>
    </div>
  );
}
