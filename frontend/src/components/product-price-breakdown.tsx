import { ShoppingCart, Tag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatMoney, TAX_RATE } from "@/lib/electron-store";
import { priceWithTax } from "@/lib/money";
import type { Product } from "@/lib/product";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";
import { cn } from "@/lib/utils";

/** Let the currency wrap onto its own line on narrow screens, keeping the
 * complete amount (including its decimal places) together. */
function PriceAmount({ formatted }: { formatted: string }) {
  const parts = formatted.trim().split(/\s+/);
  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline justify-end gap-x-1">
      {parts.map((part, i) => (
        <span key={i} className="whitespace-nowrap">
          {part}
          {i < parts.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/** Public detail views share the label's base / IVA / total breakdown.
 * Prices here are per unit; the cart continues to receive the original product. */
export function ProductPriceBreakdown({ product }: { product: Product }) {
  const { data: bcv } = useBcvRate();
  const prices = [
    {
      id: "retail",
      label: "Precio al detal",
      note: "Este es el precio del carrito",
      icon: ShoppingCart,
      ...priceWithTax(product.retailPrice, TAX_RATE),
    },
    {
      id: "wholesale",
      label: "Precio al mayor",
      note: "Solo con cotización aprobada",
      icon: Tag,
      ...priceWithTax(product.wholesalePrice, TAX_RATE),
    },
  ];

  return (
    <div role="group" aria-label={`Desglose de precios de ${product.name}`}>
      <p className="mb-2 text-xs text-muted-foreground">Precios por unidad</p>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {prices.map((price) => {
          const wholesale = price.id === "wholesale";
          const Icon = price.icon;
          return (
            <Card
              key={price.id}
              role="group"
              aria-label={`${price.label} de ${product.name}`}
              className={cn(
                "flex min-w-0 flex-col p-3 text-brand-navy shadow-none sm:p-4",
                wholesale
                  ? "border-brand-yellow/30 bg-brand-yellow/10"
                  : "border-brand-blue/25 bg-white",
              )}
            >
              <div className="flex items-start gap-1.5">
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    wholesale ? "text-brand-yellow" : "text-brand-blue",
                  )}
                />
                <h3 className="text-xs font-semibold sm:text-sm">{price.label}</h3>
              </div>
              <p
                className={cn(
                  "mt-2 min-h-10 text-xs leading-5",
                  wholesale ? "text-brand-navy/70" : "font-medium text-brand-blue",
                )}
              >
                {price.note}
              </p>

              <dl className="mt-3 flex flex-1 flex-col gap-2 text-xs tabular-nums sm:text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <dt>Sin IVA</dt>
                  <dd className="ml-auto min-w-0 max-w-full text-right">
                    <PriceAmount formatted={formatMoney(price.base)} />
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <dt>+ IVA {TAX_RATE * 100} %</dt>
                  <dd className="ml-auto min-w-0 max-w-full text-right">
                    <PriceAmount formatted={formatMoney(price.tax)} />
                  </dd>
                </div>
                <div
                  className={cn(
                    "mt-auto border-t pt-3",
                    wholesale ? "border-brand-yellow/30" : "border-brand-blue/20",
                  )}
                >
                  <dt className="text-xs font-medium">Total con IVA</dt>
                  <dd className="mt-1 text-right text-lg font-extrabold leading-tight sm:text-2xl">
                    <PriceAmount formatted={formatMoney(price.total)} />
                  </dd>
                </div>
                {bcv && (
                  <div className="text-right text-xs text-brand-navy/70">
                    <dt className="sr-only">Total en bolívares</dt>
                    <dd>
                      <PriceAmount formatted={`≈ ${formatBs(price.total, bcv.rate)}`} />
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
