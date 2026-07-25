interface QuoteTotalsLine {
  unitPrice: number;
  qty: number;
  discountPct: number;
  wholesalePrice: number;
}

interface QuoteTotalsInput {
  items: QuoteTotalsLine[];
  globalDiscountPct: number;
}

export function computeTotal(quote: QuoteTotalsInput): number {
  const subtotal = quote.items.reduce(
    (s, i) => s + i.unitPrice * i.qty * (1 - i.discountPct / 100),
    0,
  );
  return subtotal * (1 - quote.globalDiscountPct / 100);
}

export function computeWholesaleTotal(quote: QuoteTotalsInput): number {
  return quote.items.reduce((s, i) => s + i.wholesalePrice * i.qty, 0);
}
