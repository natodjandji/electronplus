import { Tag } from "lucide-react";
import { formatMoney } from "@/lib/electron-store";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";
import type { Product } from "@/lib/mock-data";

const RETAIL_TEXT = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
};

const BS_PILL = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
  lg: "text-sm px-2.5 py-1",
};

// Same pale corporate-yellow tint at every size — navy text keeps it legible.
const WHOLESALE_BOX = {
  sm: "mt-1.5 gap-1.5 rounded-md bg-brand-yellow/10 px-2 py-1",
  md: "mt-2 gap-2 rounded-md bg-brand-yellow/10 px-2.5 py-1.5",
  lg: "mt-3 gap-2.5 rounded-md bg-brand-yellow/10 px-3.5 py-2",
};

const WHOLESALE_LABEL = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
};

const WHOLESALE_AMOUNT = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
};

/**
 * Both prices are always shown to everyone — retail is what the catalog and
 * cart actually charge; the wholesale figure is informational reference,
 * only unlocked through an admin-approved quote request. The retail price
 * also shows its Bs equivalent at the day's official BCV rate.
 */
export function PriceTag({
  product,
  size = "md",
}: {
  product: Product;
  size?: "sm" | "md" | "lg";
}) {
  const { data: bcv } = useBcvRate();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`font-extrabold tabular-nums leading-none text-brand-navy ${RETAIL_TEXT[size]}`}>
          {formatMoney(product.retailPrice)}
        </span>
        {bcv && (
          <span
            className={`inline-flex items-center rounded-full bg-brand-blue/10 font-semibold tabular-nums text-brand-blue ${BS_PILL[size]}`}
          >
            ≈ {formatBs(product.retailPrice, bcv.rate)}
          </span>
        )}
      </div>

      <div className={`flex items-center ${WHOLESALE_BOX[size]}`}>
        <Tag className="h-3.5 w-3.5 shrink-0 text-brand-yellow" />
        <span className={`font-bold leading-none tabular-nums text-brand-navy ${WHOLESALE_AMOUNT[size]}`}>
          {formatMoney(product.wholesalePrice)}
        </span>
        <span className={`font-medium text-brand-navy/70 ${WHOLESALE_LABEL[size]}`}>Precio al mayor</span>
      </div>
    </div>
  );
}
