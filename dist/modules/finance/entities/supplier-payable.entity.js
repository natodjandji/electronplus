"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayableDueStatus = exports.SupplierPayableStatus = void 0;
var SupplierPayableStatus;
(function (SupplierPayableStatus) {
    SupplierPayableStatus["PENDING"] = "pending";
    SupplierPayableStatus["PAID"] = "paid";
})(SupplierPayableStatus || (exports.SupplierPayableStatus = SupplierPayableStatus = {}));
var PayableDueStatus;
(function (PayableDueStatus) {
    PayableDueStatus["CURRENT"] = "current";
    PayableDueStatus["DUE_SOON"] = "due_soon";
    PayableDueStatus["OVERDUE"] = "overdue";
})(PayableDueStatus || (exports.PayableDueStatus = PayableDueStatus = {}));
//# sourceMappingURL=supplier-payable.entity.js.map