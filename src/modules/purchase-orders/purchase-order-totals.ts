import { PurchaseOrderItemInputDto } from './dto/purchase-order-item-input.dto';
import { PurchaseOrderItem, PurchaseOrderTotals } from './entities/purchase-order.entity';

export function buildItems(
  inputs: PurchaseOrderItemInputDto[],
  products: Map<string, { sku: string; name: string }>,
): PurchaseOrderItem[] {
  return inputs.map((input) => {
    const product = products.get(input.productId);
    const discountPerItem = input.discountPerItem ?? 0;
    const subtotal = input.unitCost * input.quantityOrdered * (1 - discountPerItem / 100);
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

export function computeTotals(items: PurchaseOrderItem[], globalDiscountPct: number): PurchaseOrderTotals {
  const gross = items.reduce((sum, i) => sum + i.unitCost * i.quantityOrdered, 0);
  const afterLineDiscounts = items.reduce((sum, i) => sum + i.subtotal, 0);
  const totalAmount = afterLineDiscounts * (1 - globalDiscountPct / 100);
  return {
    subtotal: gross,
    totalDiscount: gross - totalAmount,
    totalAmount,
  };
}
