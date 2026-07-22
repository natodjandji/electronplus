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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseOrdersService = void 0;
const common_1 = require("@nestjs/common");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const finance_service_1 = require("../finance/finance.service");
const products_service_1 = require("../products/products.service");
const purchase_order_entity_1 = require("./entities/purchase-order.entity");
const purchase_order_totals_1 = require("./purchase-order-totals");
const DEFAULT_PAYABLE_TERM_DAYS = 30;
let PurchaseOrdersService = class PurchaseOrdersService {
    constructor(firestore, productsService, financeService) {
        this.firestore = firestore;
        this.productsService = productsService;
        this.financeService = financeService;
        this.repo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.PURCHASE_ORDERS);
    }
    paymentsRepo(orderId) {
        return new firestore_repository_1.FirestoreRepository(this.firestore, `${firestore_collections_1.Collections.PURCHASE_ORDERS}/${orderId}/${firestore_collections_1.Collections.PURCHASE_ORDER_PAYMENTS}`);
    }
    async create(dto, user) {
        const products = new Map(await Promise.all(dto.items.map(async (i) => {
            const product = await this.productsService.findById(i.productId);
            return [i.productId, { sku: product.sku, name: product.name }];
        })));
        const items = (0, purchase_order_totals_1.buildItems)(dto.items, products);
        const totals = (0, purchase_order_totals_1.computeTotals)(items, dto.globalDiscount ?? 0);
        return this.repo.create({
            supplierId: dto.supplierId,
            supplierName: dto.supplierName,
            items,
            globalDiscount: dto.globalDiscount ?? 0,
            totals,
            paymentTerms: dto.paymentTerms,
            notes: dto.notes,
            status: purchase_order_entity_1.PurchaseOrderStatus.DRAFT,
            amountPaid: 0,
            warehouseId: dto.warehouseId,
            createdBy: user.id,
        });
    }
    async findAll(query) {
        const where = [];
        if (query.status)
            where.push({ field: 'status', op: '==', value: query.status });
        if (query.from)
            where.push({ field: 'createdAt', op: '>=', value: new Date(query.from) });
        if (query.to)
            where.push({ field: 'createdAt', op: '<=', value: new Date(query.to) });
        const orders = await this.repo.findAll({ where, orderBy: { field: 'createdAt', direction: 'desc' } });
        return query.supplierId ? orders.filter((o) => o.supplierId === query.supplierId) : orders;
    }
    findById(id) {
        return this.repo.getOrThrow(id, 'Purchase order not found');
    }
    listPayments(orderId) {
        return this.paymentsRepo(orderId).findAll({ orderBy: { field: 'paidAt', direction: 'desc' } });
    }
    async updateItems(id, dto) {
        const order = await this.findById(id);
        if (order.status !== purchase_order_entity_1.PurchaseOrderStatus.DRAFT) {
            throw new common_1.ForbiddenException('Only draft purchase orders can have their items edited');
        }
        const products = new Map(await Promise.all(dto.items.map(async (i) => {
            const product = await this.productsService.findById(i.productId);
            return [i.productId, { sku: product.sku, name: product.name }];
        })));
        const items = (0, purchase_order_totals_1.buildItems)(dto.items, products);
        const totals = (0, purchase_order_totals_1.computeTotals)(items, dto.globalDiscount ?? order.globalDiscount);
        return this.repo.update(id, { items, globalDiscount: dto.globalDiscount ?? order.globalDiscount, totals });
    }
    async updatePaymentTerms(id, dto) {
        const order = await this.findById(id);
        if (order.status === purchase_order_entity_1.PurchaseOrderStatus.PAID || order.status === purchase_order_entity_1.PurchaseOrderStatus.CANCELLED) {
            throw new common_1.ForbiddenException('Payment terms can only be changed before the order is settled or cancelled');
        }
        return this.repo.update(id, { paymentTerms: dto.paymentTerms, notes: dto.notes });
    }
    async issue(id) {
        const order = await this.findById(id);
        if (order.status !== purchase_order_entity_1.PurchaseOrderStatus.DRAFT) {
            throw new common_1.ForbiddenException('Only draft purchase orders can be issued');
        }
        const issueDate = new Date();
        const dueDate = new Date(issueDate);
        dueDate.setDate(dueDate.getDate() + DEFAULT_PAYABLE_TERM_DAYS);
        const toIso = (d) => d.toISOString().slice(0, 10);
        const payable = await this.financeService.createInvoice({
            supplierId: order.supplierId,
            supplierName: order.supplierName,
            invoiceNumber: `PO-${order.id.slice(0, 8).toUpperCase()}`,
            amount: order.totals.totalAmount,
            issueDate: toIso(issueDate),
            dueDate: toIso(dueDate),
        });
        return this.repo.update(id, {
            status: purchase_order_entity_1.PurchaseOrderStatus.ISSUED,
            issuedAt: issueDate,
            linkedPayableId: payable.id,
        });
    }
    async registerPayment(id, dto, user) {
        const order = await this.findById(id);
        if (order.status === purchase_order_entity_1.PurchaseOrderStatus.DRAFT) {
            throw new common_1.BadRequestException('Issue the purchase order before registering payments against it');
        }
        if (order.status === purchase_order_entity_1.PurchaseOrderStatus.PAID || order.status === purchase_order_entity_1.PurchaseOrderStatus.CANCELLED) {
            throw new common_1.BadRequestException('This purchase order is already settled or cancelled');
        }
        const paidAt = new Date();
        await this.paymentsRepo(id).create({
            amount: dto.amount,
            method: dto.method,
            reference: dto.reference,
            paidAt,
            registeredByUserId: user.id,
        });
        if (order.linkedPayableId) {
            await this.financeService.registerPayment(order.linkedPayableId, dto, user.id);
        }
        const amountPaid = order.amountPaid + dto.amount;
        const fullyPaid = amountPaid >= order.totals.totalAmount;
        const updated = await this.repo.update(id, {
            amountPaid,
            status: fullyPaid ? purchase_order_entity_1.PurchaseOrderStatus.PAID : purchase_order_entity_1.PurchaseOrderStatus.PARTIALLY_PAID,
            paymentDetails: { paidAt, method: dto.method, reference: dto.reference },
        });
        if (fullyPaid) {
            for (const item of order.items) {
                await this.productsService.adjustStock(item.productId, {
                    delta: item.quantityOrdered,
                    warehouseId: order.warehouseId,
                    reason: `Purchase order ${order.id} settled`,
                });
            }
        }
        return updated;
    }
    async cancel(id) {
        const order = await this.findById(id);
        if (order.status === purchase_order_entity_1.PurchaseOrderStatus.PAID) {
            throw new common_1.ForbiddenException('A fully paid purchase order cannot be cancelled');
        }
        return this.repo.update(id, { status: purchase_order_entity_1.PurchaseOrderStatus.CANCELLED, cancelledAt: new Date() });
    }
};
exports.PurchaseOrdersService = PurchaseOrdersService;
exports.PurchaseOrdersService = PurchaseOrdersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function, products_service_1.ProductsService,
        finance_service_1.FinanceService])
], PurchaseOrdersService);
//# sourceMappingURL=purchase-orders.service.js.map