import { Wallet } from "lucide-react";

/**
 * Placeholder until the store is an approved Cashea affiliate and has
 * access to their official brand kit (logo, colors, guidelines) via
 * merchants.cashea.app — using their trademarked logo before then isn't
 * appropriate. Swap the icon/copy for the official badge once that kit
 * arrives; the layout below is sized to drop a logo image in directly.
 */
export function CasheaBanner() {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-brand-yellow/40 bg-brand-yellow/10 px-4 py-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-navy text-white">
        <Wallet className="h-4.5 w-4.5" />
      </div>
      <div>
        <div className="text-sm font-bold text-brand-navy">Disponible en Cashea</div>
        <div className="text-xs text-muted-foreground">
          Compra ahora y paga después en cuotas, sin interés.
        </div>
      </div>
    </div>
  );
}
