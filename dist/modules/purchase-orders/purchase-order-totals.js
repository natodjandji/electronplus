"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildItems = buildItems;
exports.computeTotals = computeTotals;
function buildItems(inputs, products) {
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
function computeTotals(items, globalDiscountPct) {
    const gross = items.reduce((sum, i) => sum + i.unitCost * i.quantityOrdered, 0);
    const afterLineDiscounts = items.reduce((sum, i) => sum + i.subtotal, 0);
    const totalAmount = afterLineDiscounts * (1 - globalDiscountPct / 100);
    return {
        subtotal: gross,
        totalDiscount: gross - totalAmount,
        totalAmount,
    };
}
//# sourceMappingURL=purchase-order-totals.js.map