import { formatMoney } from "@/lib/electron-store";
import type { Product } from "@/lib/mock-data";

const SIZES = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};

/**
 * Both prices are always shown to everyone — retail is what the catalog and
 * cart actually charge; the wholesale figure is informational reference,
 * only unlocked through an admin-approved quote request.
 */
export function PriceTag({
  product,
  size = "md",
}: {
  product: Product;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className={`font-bold tabular-nums text-brand-navy ${SIZES[size]}`}>
          {formatMoney(product.retailPrice)}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        Mayorista: <span className="tabular-nums">{formatMoney(product.wholesalePrice)}</span> ·
        cotiza para acceder
      </div>
    </div>
  );
}
