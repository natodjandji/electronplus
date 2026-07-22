import { Quote } from './entities/quote.entity';

export interface QuoteLineTotal {
  id: string;
  productId: string;
  qty: number;
  unitPrice: number;
  wholesalePrice: number;
  discountPct: number;
  lineTotal: number;
  wholesaleLineTotal: number;
}

export interface QuoteTotals {
  lines: QuoteLineTotal[];
  subtotal: number;
  globalDiscountPct: number;
  total: number;
  /** Reference only — the wholesale total never gets the admin discount applied. */
  wholesaleTotal: number;
}

export function computeQuoteTotals(quote: Quote): QuoteTotals {
  const lines: QuoteLineTotal[] = (quote.items ?? []).map((item) => {
    const lineTotal = item.unitPrice * item.qty * (1 - item.discountPct / 100);
    const wholesaleLineTotal = item.wholesalePrice * item.qty;
    return {
      id: item.id,
      productId: item.productId,
      qty: item.qty,
      unitPrice: item.unitPrice,
      wholesalePrice: item.wholesalePrice,
      discountPct: item.discountPct,
      lineTotal,
      wholesaleLineTotal,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const globalDiscountPct = quote.globalDiscountPct;
  const total = subtotal * (1 - globalDiscountPct / 100);
  const wholesaleTotal = lines.reduce((sum, l) => sum + l.wholesaleLineTotal, 0);

  return { lines, subtotal, globalDiscountPct, total, wholesaleTotal };
}
