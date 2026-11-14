import { formatMoney, TAX_RATE } from "@/lib/electron-store";
import { priceWithTax } from "@/lib/money";
import type { Product } from "@/lib/product";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";

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
    { id: "retail", label: "Detal", ...priceWithTax(product.retailPrice, TAX_RATE) },
    { id: "wholesale", label: "Mayor", ...priceWithTax(product.wholesalePrice, TAX_RATE) },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full table-fixed border-collapse text-right text-sm text-brand-navy tabular-nums">
        <caption className="sr-only">
          Precios por unidad de {product.name}: sin IVA, IVA y total al detal y al mayor
        </caption>
        <thead className="bg-brand-surface text-xs">
          <tr>
            <th className="w-[28%] px-3 py-3 text-left font-medium sm:px-4">Por unidad</th>
            {prices.map((price) => (
              <th key={price.id} scope="col" className="px-2 py-3 font-semibold sm:px-4">
                {price.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border">
            <th
              scope="row"
              className="px-3 py-2.5 text-left text-xs font-normal sm:px-4 sm:text-sm"
            >
              Sin IVA
            </th>
            {prices.map((price) => (
              <td key={price.id} className="px-2 py-2.5 text-xs sm:px-4 sm:text-sm">
                <PriceAmount formatted={formatMoney(price.base)} />
              </td>
            ))}
          </tr>
          <tr>
            <th
              scope="row"
              className="px-3 py-2.5 text-left text-xs font-normal sm:px-4 sm:text-sm"
            >
              + IVA {TAX_RATE * 100} %
            </th>
            {prices.map((price) => (
              <td key={price.id} className="px-2 py-2.5 text-xs sm:px-4 sm:text-sm">
                <PriceAmount formatted={formatMoney(price.tax)} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-brand-blue/20 bg-brand-blue/5 font-bold">
            <th scope="row" className="px-3 py-3 text-left text-sm sm:px-4">
              Total
            </th>
            {prices.map((price) => (
              <td key={price.id} className="px-2 py-3 text-base sm:px-4 sm:text-lg">
                <PriceAmount formatted={formatMoney(price.total)} />
              </td>
            ))}
          </tr>
        </tbody>
        {bcv && (
          <tfoot className="border-t border-border text-xs text-brand-blue">
            <tr>
              <th scope="row" className="px-3 py-3 text-left font-medium sm:px-4">
                Total en Bs.
              </th>
              {prices.map((price) => (
                <td key={price.id} className="px-2 py-3 sm:px-4">
                  <PriceAmount formatted={`≈ ${formatBs(price.total, bcv.rate)}`} />
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
