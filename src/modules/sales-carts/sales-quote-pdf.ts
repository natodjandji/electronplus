import { formatPercent, longDate, PRICE_TERMS, QuotePdf } from '../../common/pdf/quote-pdf';
import { PriceList } from './entities/sales-cart.entity';
import { SharedQuote } from './entities/shared-quote.entity';

const PRICE_LIST_LABEL: Record<PriceList, string> = {
  [PriceList.RETAIL]: 'Precio detal',
  [PriceList.WHOLESALE]: 'Precio al mayor',
};

export const quoteNumberLabel = (n: number) => String(n).padStart(6, '0');

/** A seller's shared quote, as the sheet the customer keeps and the seller
 * prints (see renderQuotePdf). */
export function salesQuotePdf(quote: Omit<SharedQuote, 'cartId'>): QuotePdf {
  const number = quoteNumberLabel(quote.number);
  const customer = quote.customer ?? {};
  const qr = quote.qrImageDataUrl?.split(',')[1];
  return {
    title: `Cotización N.º ${number} · Electron Plus`,
    numberLabel: number,
    headerLines: [
      { text: `Emitida el ${longDate(quote.issuedAt)}` },
      { text: `Válida hasta el ${longDate(quote.validUntil)}`, strong: true },
    ],
    parties: [
      {
        title: 'CLIENTE',
        heading: customer.name || 'No indicado',
        muted: !customer.name,
        lines: [
          customer.taxId ? `RIF/C.I.: ${customer.taxId}` : '',
          customer.phone ? `Tel.: ${customer.phone}` : '',
        ].filter(Boolean),
      },
      {
        title: 'ATENDIDO POR',
        heading: quote.sellerName,
        lines: [PRICE_LIST_LABEL[quote.priceList], 'Montos en REF (dólares de referencia)'],
      },
    ],
    lines: quote.lines,
    totalRows: [
      { label: 'Subtotal', amount: quote.subtotal },
      ...(quote.discountPct > 0
        ? [
            {
              label: `Descuento (${formatPercent(quote.discountPct)})`,
              amount: -quote.discountAmount,
            },
          ]
        : []),
      { label: 'Base imponible', amount: quote.taxableBase },
      { label: 'IVA (16%)', amount: quote.taxAmount },
    ],
    total: quote.total,
    bcv: quote.bcvRate ? { rate: quote.bcvRate, date: quote.issuedAt } : undefined,
    qr: qr
      ? {
          png: Buffer.from(qr, 'base64'),
          caption: 'Escanea el código para ver esta cotización en línea.',
        }
      : undefined,
    terms: [
      ...PRICE_TERMS,
      `Cotización válida hasta el ${longDate(quote.validUntil)}, sujeta a disponibilidad de inventario.`,
      'Este documento no es una factura.',
    ],
  };
}
