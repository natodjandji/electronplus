"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var FinanceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceService = exports.INVOICE_DUE_ALERT_EVENT = exports.DUE_SOON_THRESHOLD_DAYS = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const event_emitter_1 = require("@nestjs/event-emitter");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const supplier_payable_entity_1 = require("./entities/supplier-payable.entity");
exports.DUE_SOON_THRESHOLD_DAYS = 5;
exports.INVOICE_DUE_ALERT_EVENT = 'finance.invoice.due';
let FinanceService = FinanceService_1 = class FinanceService {
    constructor(firestore, events) {
        this.firestore = firestore;
        this.events = events;
        this.logger = new common_1.Logger(FinanceService_1.name);
        this.suppliersRepo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.SUPPLIERS);
        this.payablesRepo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.SUPPLIERS_PAYABLES);
    }
    createSupplier(dto) {
        return this.suppliersRepo.create(dto);
    }
    listSuppliers() {
        return this.suppliersRepo.findAll({ orderBy: { field: 'name' } });
    }
    async createInvoice(dto) {
        return this.payablesRepo.create({
            supplierId: dto.supplierId,
            supplierName: dto.supplierName,
            invoiceNumber: dto.invoiceNumber,
            amount: dto.amount,
            currency: dto.currency ?? 'USD',
            issueDate: dto.issueDate,
            dueDate: dto.dueDate,
            status: supplier_payable_entity_1.SupplierPayableStatus.PENDING,
            dueStatus: dueStatusForDueDate(dto.dueDate),
            amountPaid: 0,
        });
    }
    async listInvoices(status) {
        return this.payablesRepo.findAll({
            where: status ? [{ field: 'status', op: '==', value: status }] : [],
            orderBy: { field: 'dueDate', direction: 'asc' },
        });
    }
    findInvoice(id) {
        return this.payablesRepo.getOrThrow(id, 'Supplier invoice not found');
    }
    paymentsRepo(invoiceId) {
        return new firestore_repository_1.FirestoreRepository(this.firestore, `${firestore_collections_1.Collections.SUPPLIERS_PAYABLES}/${invoiceId}/${firestore_collections_1.Collections.SUPPLIER_PAYMENTS}`);
    }
    async registerPayment(invoiceId, dto, adminUserId) {
        const invoice = await this.findInvoice(invoiceId);
        if (invoice.status === supplier_payable_entity_1.SupplierPayableStatus.PAID) {
            throw new common_1.BadRequestException('This invoice is already fully paid');
        }
        await this.paymentsRepo(invoiceId).create({
            amount: dto.amount,
            paidAt: new Date(),
            method: dto.method,
            reference: dto.reference,
            registeredByUserId: adminUserId,
        });
        const newAmountPaid = invoice.amountPaid + dto.amount;
        const fullyPaid = newAmountPaid >= invoice.amount;
        return this.payablesRepo.update(invoiceId, {
            amountPaid: newAmountPaid,
            status: fullyPaid ? supplier_payable_entity_1.SupplierPayableStatus.PAID : supplier_payable_entity_1.SupplierPayableStatus.PENDING,
            dueStatus: fullyPaid ? supplier_payable_entity_1.PayableDueStatus.CURRENT : dueStatusForDueDate(invoice.dueDate),
        });
    }
    listPayments(invoiceId) {
        return this.paymentsRepo(invoiceId).findAll({ orderBy: { field: 'paidAt', direction: 'desc' } });
    }
    async recomputeDueStatuses() {
        const openInvoices = await this.payablesRepo.findAll({
            where: [{ field: 'status', op: '==', value: supplier_payable_entity_1.SupplierPayableStatus.PENDING }],
        });
        for (const invoice of openInvoices) {
            const nextDueStatus = dueStatusForDueDate(invoice.dueDate);
            if (nextDueStatus === invoice.dueStatus)
                continue;
            await this.payablesRepo.update(invoice.id, { dueStatus: nextDueStatus });
            if (nextDueStatus === supplier_payable_entity_1.PayableDueStatus.DUE_SOON || nextDueStatus === supplier_payable_entity_1.PayableDueStatus.OVERDUE) {
                this.events.emit(exports.INVOICE_DUE_ALERT_EVENT, {
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    supplierName: invoice.supplierName,
                    dueStatus: nextDueStatus,
                    dueDate: invoice.dueDate,
                });
            }
        }
        this.logger.log(`Recomputed due status for ${openInvoices.length} open supplier invoice(s)`);
    }
};
exports.FinanceService = FinanceService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_6AM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanceService.prototype, "recomputeDueStatuses", null);
exports.FinanceService = FinanceService = FinanceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function, event_emitter_1.EventEmitter2])
], FinanceService);
function dueStatusForDueDate(dueDate) {
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue < 0)
        return supplier_payable_entity_1.PayableDueStatus.OVERDUE;
    if (daysUntilDue <= exports.DUE_SOON_THRESHOLD_DAYS)
        return supplier_payable_entity_1.PayableDueStatus.DUE_SOON;
    return supplier_payable_entity_1.PayableDueStatus.CURRENT;
}
//# sourceMappingURL=finance.service.js.map