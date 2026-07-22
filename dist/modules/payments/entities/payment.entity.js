"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANUAL_RECONCILIATION_METHODS = exports.PaymentStatus = exports.PaymentMethod = void 0;
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["BANK_TRANSFER"] = "bank_transfer";
    PaymentMethod["PAGO_MOVIL"] = "pago_movil";
    PaymentMethod["CASH"] = "cash";
    PaymentMethod["ZELLE"] = "zelle";
    PaymentMethod["PAYPAL"] = "paypal";
    PaymentMethod["CREDIT_B2B"] = "credit_b2b";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "pending";
    PaymentStatus["VERIFIED"] = "verified";
    PaymentStatus["REJECTED"] = "rejected";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
exports.MANUAL_RECONCILIATION_METHODS = [
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.PAGO_MOVIL,
    PaymentMethod.CASH,
    PaymentMethod.ZELLE,
];
//# sourceMappingURL=payment.entity.js.map