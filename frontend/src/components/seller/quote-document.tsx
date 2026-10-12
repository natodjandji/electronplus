import { ElectronLogo } from "@/components/electron-logo";
import { CONTACT_INFO } from "@/lib/contact-info";
import { formatMoney } from "@/lib/electron-store";
import { formatQuoteNumber, PRICE_LIST_LABEL, type SharedQuote } from "@/lib/sales-carts";
import { formatBs } from "@/lib/use-bcv-rate";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** A shared sales cart as a formal quote — the customer's page, and the
 * letter-size sheet printed from it. */
export function QuoteDocument({ quote }: { quote: SharedQuote }) {
  const customer = quote.customer;
  return (
    <article className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <ElectronLogo className="h-9" />
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <div>{CONTACT_INFO.phone}</div>
            <div>{CONTACT_INFO.email}</div>
            <div>{CONTACT_INFO.hours}</div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
            Cotización
          </div>
          <div className="text-2xl font-bold tabular-nums text-brand-navy">
            N.º {formatQuoteNumber(quote.number)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Emitida el {formatDate(quote.issuedAt)}
          </div>
          <div className="text-xs font-medium text-brand-navy">
            Válida hasta el {formatDate(quote.validUntil)}
          </div>
        </div>
      </header>

      <section className="grid gap-4 border-b border-border py-5 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cliente
          </div>
          <div className="mt-1 font-medium text-brand-navy">{customer.name || "—"}</div>
          {customer.taxId && (
            <div className="text-muted-foreground">RIF/C.I.: {customer.taxId}</div>
          )}
          {customer.phone && <div className="text-muted-foreground">Tel.: {customer.phone}</div>}
        </div>
        <div className="sm:text-right">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Atendido por
          </div>
          <div className="mt-1 font-medium text-brand-navy">{quote.sellerName}</div>
          <div className="text-muted-foreground">{PRICE_LIST_LABEL[quote.priceList]}</div>
        </div>
      </section>

      {/* On a phone the unit price moves under the name instead of a column
          that would push the table off screen; print keeps the full table. */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-2 font-semibold">Producto</th>
            <th className="px-2 py-2 text-right font-semibold">Cant.</th>
            <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell print:table-cell">
              Precio unit.
            </th>
            <th className="py-2 pl-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((line, index) => (
            <tr
              key={`${line.sku}-${index}`}
              className="border-b border-border/70 align-top break-inside-avoid"
            >
              <td className="py-2.5 pr-2">
                <div className="font-medium text-brand-navy">{line.name}</div>
                <div className="text-xs text-muted-foreground">
                  {line.sku}
                  <span className="sm:hidden print:hidden">
                    {" "}
                    · {formatMoney(line.unitPrice)} c/u
                  </span>
                </div>
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">{line.qty}</td>
              <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell print:table-cell">
                {formatMoney(line.unitPrice)}
              </td>
              <td className="whitespace-nowrap py-2.5 pl-2 text-right font-medium tabular-nums">
                {formatMoney(line.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="flex flex-col-reverse gap-6 pt-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <img
            src={quote.qrImageDataUrl}
            alt=""
            className="h-20 w-20 rounded-md border border-border bg-white p-1"
          />
          <p className="max-w-[14rem] text-xs text-muted-foreground">
            Escanea el código para ver esta cotización en línea.
          </p>
        </div>
        <dl className="w-full space-y-1 text-sm sm:w-72">
          <TotalRow label="Subtotal" value={formatMoney(quote.subtotal)} />
          {quote.discountPct > 0 && (
            <TotalRow
              label={`Descuento (${quote.discountPct}%)`}
              value={`-${formatMoney(quote.discountAmount)}`}
            />
          )}
          <TotalRow label="Base imponible" value={formatMoney(quote.taxableBase)} />
          <TotalRow label="IVA (16%)" value={formatMoney(quote.taxAmount)} />
          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <dt className="font-semibold text-brand-navy">Total</dt>
            <dd className="text-xl font-bold tabular-nums text-brand-navy">
              {formatMoney(quote.total)}
            </dd>
          </div>
          {quote.bcvRate && (
            <div className="text-right text-xs text-muted-foreground">
              {formatBs(quote.total, quote.bcvRate)} a tasa BCV del {formatDate(quote.issuedAt)} (
              {formatBs(1, quote.bcvRate)} por USD)
            </div>
          )}
        </dl>
      </section>

      <footer className="mt-6 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
        Precios en REF (dólares de referencia). El pago en bolívares se calcula a la tasa BCV del
        día del pago. Cotización sujeta a disponibilidad de inventario; no es una factura.
      </footer>
    </article>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-brand-navy">{value}</dd>
    </div>
  );
}
