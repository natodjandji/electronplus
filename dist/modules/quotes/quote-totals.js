"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeQuoteTotals = computeQuoteTotals;
function computeQuoteTotals(quote) {
    const lines = (quote.items ?? []).map((item) => {
        const lineTotal = item.unitPrice * item.qty * (1 - item.discountPct / 100);
        return { id: item.id, productId: item.productId, qty: item.qty, unitPrice: item.unitPrice, discountPct: item.discountPct, lineTotal };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const globalDiscountPct = quote.globalDiscountPct;
    const total = subtotal * (1 - globalDiscountPct / 100);
    return { lines, subtotal, globalDiscountPct, total };
}
//# sourceMappingURL=quote-totals.js.map