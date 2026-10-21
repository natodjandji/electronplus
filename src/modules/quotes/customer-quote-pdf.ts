import {
  formatPercent,
  longDate,
  PRICE_TERMS,
  QuotePdf,
  formatRef,
} from '../../common/pdf/quote-pdf';
import { round2, TAX_RATE } from '../../common/utils/money';
import { PaymentMethod } from '../payments/entities/payment.entity';
import { Quote, QuoteStatus } from './entities/quote.entity';
import { computeQuoteTotals } from './quote-totals';

const STATUS_LABEL: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]: 'Borrador',
  [QuoteStatus.SENT]: 'En revisión',
  [QuoteStatus.APPROVED]: 'Aprobada',
  [QuoteStatus.REJECTED]: 'Rechazada',
};

/** The built-in methods' names (payment-methods.service.ts defaults). */
const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.BANK_TRANSFER]: 'Transferencia bancaria',
  [PaymentMethod.PAGO_MOVIL]: 'Pago móvil',
  [PaymentMethod.CASH]: 'Efectivo en tienda',
  [PaymentMethod.ZELLE]: 'Zelle',
  [PaymentMethod.PAYPAL]: 'PayPal',
  [PaymentMethod.CASHEA]: 'Cashea',
  [PaymentMethod.OTHER]: 'Otro',
};

function statusTerm(quote: Quote): string {
  switch (quote.status) {
    case QuoteStatus.DRAFT:
      return 'Borrador: todavía no se ha enviado a revisión, los precios pueden cambiar.';
    case QuoteStatus.SENT:
      return 'Solicitud en revisión: precios y descuentos sujetos a la aprobación de Electron Plus.';
    case QuoteStatus.APPROVED:
      return 'Cotización aprobada con los precios y descuentos indicados, sujeta a disponibilidad de inventario.';
    case QuoteStatus.REJECTED:
      return quote.rejectionReason
        ? `Solicitud rechazada: ${quote.rejectionReason}`
        : 'Solicitud rechazada.';
  }
}

/** The short id customers see for their own quotes, which have no number. */
export const customerQuoteLabel = (quote: Pick<Quote, 'id'>) => quote.id.slice(0, 8).toUpperCase();

/**
 * A customer's own quote on the same sheet as the sellers' (see
 * renderQuotePdf). The figures are what checking it out charges (see
 * OrdersService.createFromQuote): line discounts, then the special discount,
 * then 16% IVA — shipping comes later, at checkout.
 */
export function customerQuotePdf(
  quote: Quote,
  bcvRate: number | undefined,
  now = new Date(),
): QuotePdf {
  const totals = computeQuoteTotals(quote);
  const subtotal = round2(totals.subtotal);
  const taxableBase = round2(totals.total);
  const taxAmount = round2(taxableBase * TAX_RATE);
  const total = round2(taxableBase + taxAmount);
  const label = customerQuoteLabel(quote);

  return {
    title: `Cotización N.º ${label} · Electron Plus`,
    numberLabel: label,
    headerLines: [
      { text: `Creada el ${longDate(quote.createdAt)}` },
      { text: `Estado: ${STATUS_LABEL[quote.status]}`, strong: true },
    ],
    parties: [
      {
        title: 'CLIENTE',
        heading: quote.customerName || 'No indicado',
        muted: !quote.customerName,
        lines: [
          quote.customerTaxId ? `RIF/C.I.: ${quote.customerTaxId}` : '',
          quote.expectedPaymentMethod
            ? `Pago previsto: ${quote.expectedPaymentMethodLabel ?? PAYMENT_METHOD_LABEL[quote.expectedPaymentMethod] ?? quote.expectedPaymentMethod}`
            : '',
        ].filter(Boolean),
      },
      {
        title: 'PRECIOS',
        heading: 'Precio detal',
        lines: [
          'Montos en REF (dólares de referencia)',
          quote.globalDiscountPct > 0
            ? `Descuento especial: ${formatPercent(quote.globalDiscountPct)}`
            : '',
        ].filter(Boolean),
      },
    ],
    lines: quote.items.map((item, i) => ({
      sku: item.sku,
      name: item.name,
      note: item.discountPct > 0 ? `Descuento ${formatPercent(item.discountPct)}` : undefined,
      qty: item.qty,
      unitPrice: item.unitPrice,
      lineTotal: round2(totals.lines[i].lineTotal),
    })),
    totalRows: [
      { label: 'Subtotal', amount: subtotal },
      ...(quote.globalDiscountPct > 0
        ? [
            {
              label: `Descuento especial (${formatPercent(quote.globalDiscountPct)})`,
              amount: -round2(subtotal - taxableBase),
            },
          ]
        : []),
      { label: 'Base imponible', amount: taxableBase },
      { label: 'IVA (16%)', amount: taxAmount },
    ],
    total,
    totalNotes: [
      `Total al mayor de referencia (sin IVA): ${formatRef(round2(totals.wholesaleTotal))}`,
    ],
    bcv: bcvRate ? { rate: bcvRate, date: now } : undefined,
    terms: [
      ...PRICE_TERMS,
      statusTerm(quote),
      'El costo de envío, si aplica, se calcula al confirmar el pedido.',
      'Este documento no es una factura.',
    ],
  };
}
