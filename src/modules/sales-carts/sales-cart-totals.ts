import { round2, TAX_RATE } from '../../common/utils/money';
import { PriceList, SalesCart, SalesCartItem } from './entities/sales-cart.entity';

export interface SalesCartLineTotal extends SalesCartItem {
  unitPrice: number;
  lineTotal: number;
}

export interface SalesCartTotals {
  lines: SalesCartLineTotal[];
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
}

function unitPriceFor(item: SalesCartItem, priceList: PriceList): number {
  return priceList === PriceList.WHOLESALE ? item.wholesalePrice : item.retailPrice;
}

/** Same arithmetic as an order: discount on the subtotal, IVA on what's left. */
export function computeSalesCartTotals(
  cart: Pick<SalesCart, 'items' | 'priceList' | 'discountPct'>,
): SalesCartTotals {
  const lines = cart.items.map((item) => {
    const unitPrice = unitPriceFor(item, cart.priceList);
    return { ...item, unitPrice, lineTotal: round2(unitPrice * item.qty) };
  });
  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const discountAmount = round2((subtotal * cart.discountPct) / 100);
  const taxableBase = round2(subtotal - discountAmount);
  const taxAmount = round2(taxableBase * TAX_RATE);
  return {
    lines,
    subtotal,
    discountAmount,
    taxableBase,
    taxAmount,
    total: round2(taxableBase + taxAmount),
  };
}
