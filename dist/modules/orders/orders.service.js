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
exports.OrdersService = exports.ORDER_PAID_EVENT = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const firestore_1 = require("firebase-admin/firestore");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const role_enum_1 = require("../../common/enums/role.enum");
const payment_entity_1 = require("../payments/entities/payment.entity");
const payments_service_1 = require("../payments/payments.service");
const pricing_service_1 = require("../products/pricing.service");
const products_service_1 = require("../products/products.service");
const order_entity_1 = require("./entities/order.entity");
exports.ORDER_PAID_EVENT = 'order.paid';
let OrdersService = class OrdersService {
    constructor(firestore, productsService, pricingService, paymentsService, events) {
        this.firestore = firestore;
        this.productsService = productsService;
        this.pricingService = pricingService;
        this.paymentsService = paymentsService;
        this.events = events;
        this.repo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.ORDERS);
    }
    async create(user, dto) {
        const productIds = dto.items.map((i) => i.productId);
        if (new Set(productIds).size !== productIds.length) {
            throw new common_1.BadRequestException('Duplicate product in order items — merge quantities into a single line instead');
        }
        const { orderId, stockChanges } = await this.firestore.runTransaction(async (tx) => {
            const reads = await Promise.all(dto.items.map((line) => this.productsService.getForUpdate(tx, line.productId)));
            let totalAmount = 0;
            const items = [];
            const stockChanges = [];
            reads.forEach(({ ref, product }, idx) => {
                const line = dto.items[idx];
                const nextStock = this.productsService.reserveStock(tx, ref, product, line.qty);
                const unitPrice = this.pricingService.priceFor(product);
                const lineTotal = unitPrice * line.qty;
                totalAmount += lineTotal;
                items.push({
                    productId: product.id,
                    sku: product.sku,
                    name: product.name,
                    categoryLabel: product.category.label,
                    qty: line.qty,
                    unitPrice,
                    unitCost: product.cost,
                    lineTotal,
                });
                stockChanges.push({
                    productId: product.id,
                    sku: product.sku,
                    name: product.name,
                    stock: nextStock,
                    minStockThreshold: product.minStockThreshold,
                });
            });
            const orderRef = this.repo.collection().doc();
            const now = firestore_1.FieldValue.serverTimestamp();
            tx.set(orderRef, {
                userId: user.id,
                status: order_entity_1.OrderStatus.PENDING_PAYMENT_VERIFICATION,
                paymentMethod: dto.paymentMethod,
                totalAmount,
                shippingFullName: dto.shipping.fullName,
                shippingPhone: dto.shipping.phone,
                shippingTaxId: dto.shipping.taxId,
                shippingAddress: dto.shipping.address,
                shippingCity: dto.shipping.city,
                shippingState: dto.shipping.state,
                items,
                createdAt: now,
                updatedAt: now,
            });
            return { orderId: orderRef.id, stockChanges };
        });
        for (const change of stockChanges)
            this.productsService.emitStockChanged(change);
        const order = await this.repo.getOrThrow(orderId);
        let payment;
        try {
            payment = await this.paymentsService.initiate(order.id, dto.paymentMethod, order.totalAmount, dto.paymentReference);
        }
        catch (error) {
            await this.compensate(order);
            throw new common_1.BadGatewayException(`Could not initiate payment for the order, it was cancelled: ${error.message}`);
        }
        if (payment.status === payment_entity_1.PaymentStatus.VERIFIED) {
            return this.markPaid(order.id);
        }
        return this.findById(order.id, user);
    }
    async compensate(order) {
        for (const item of order.items) {
            await this.productsService.adjustStock(item.productId, { delta: item.qty });
        }
        await this.repo.delete(order.id);
    }
    findMine(user) {
        return this.repo.findAll({
            where: [{ field: 'userId', op: '==', value: user.id }],
            orderBy: { field: 'createdAt', direction: 'desc' },
        });
    }
    findAll() {
        return this.repo.findAll({ orderBy: { field: 'createdAt', direction: 'desc' } });
    }
    async findById(id, user) {
        const order = await this.repo.getOrThrow(id, 'Order not found');
        if (user && order.userId !== user.id && user.role !== role_enum_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('This order does not belong to you');
        }
        return order;
    }
    async markPaid(orderId) {
        const order = await this.repo.update(orderId, { status: order_entity_1.OrderStatus.PAID });
        this.events.emit(exports.ORDER_PAID_EVENT, { orderId: order.id });
        return order;
    }
    async markErpExported(orderId, error) {
        if (error) {
            await this.repo.update(orderId, { erpExportError: error });
        }
        else {
            await this.repo.update(orderId, { erpExportedAt: new Date(), erpExportError: firestore_1.FieldValue.delete() });
        }
    }
    markFulfilled(orderId) {
        return this.repo.update(orderId, { status: order_entity_1.OrderStatus.FULFILLED });
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function, products_service_1.ProductsService,
        pricing_service_1.PricingService,
        payments_service_1.PaymentsService,
        event_emitter_1.EventEmitter2])
], OrdersService);
//# sourceMappingURL=orders.service.js.map