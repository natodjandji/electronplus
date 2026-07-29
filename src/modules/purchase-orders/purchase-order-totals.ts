import { PurchaseOrderItemInputDto } from './dto/purchase-order-item-input.dto';
import { PurchaseOrderItem, PurchaseOrderTotals } from './entities/purchase-order.entity';

// Unrounded floats here (e.g. totalAmount = 61.17435...) get stored as-is in
// Firestore. An admin registering a payment naturally types the rounded
// amount (61.17), which then permanently fails `amountPaid >= totalAmount`
// in purchase-orders.service.ts — the order gets stuck PARTIALLY_PAID
// forever and its stock-in (gated on fullyPaid) never happens. orders.ts
// already rounds every computed total for the same reason; this mirrors it.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildItems(
  inputs: PurchaseOrderItemInputDto[],
  products: Map<string, { sku: string; name: string }>,
): PurchaseOrderItem[] {
  return inputs.map((input) => {
    const product = products.get(input.productId);
    const discountPerItem = input.discountPerItem ?? 0;
    const subtotal = round2(input.unitCost * input.quantityOrdered * (1 - discountPerItem / 100));
    return {
      productId: input.productId,
      sku: product?.sku ?? input.productId,
      name: product?.name ?? input.productId,
      quantityOrdered: input.quantityOrdered,
      unitCost: input.unitCost,
      discountPerItem,
      subtotal,
    };
  });
}

export function computeTotals(
  items: PurchaseOrderItem[],
  globalDiscountPct: number,
): PurchaseOrderTotals {
  const gross = round2(items.reduce((sum, i) => sum + i.unitCost * i.quantityOrdered, 0));
  const afterLineDiscounts = items.reduce((sum, i) => sum + i.subtotal, 0);
  const totalAmount = round2(afterLineDiscounts * (1 - globalDiscountPct / 100));
  return {
    subtotal: gross,
    totalDiscount: round2(gross - totalAmount),
    totalAmount,
  };
}
