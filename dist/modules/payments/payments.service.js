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
exports.PaymentsService = exports.PAYMENT_VERIFIED_EVENT = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const payment_entity_1 = require("./entities/payment.entity");
const paypal_client_1 = require("./paypal.client");
exports.PAYMENT_VERIFIED_EVENT = 'payment.verified';
let PaymentsService = class PaymentsService {
    constructor(firestore, paypal, events) {
        this.paypal = paypal;
        this.events = events;
        this.repo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.PAYMENTS);
    }
    async initiate(orderId, method, amount, reference) {
        const isManual = payment_entity_1.MANUAL_RECONCILIATION_METHODS.includes(method);
        const isCredit = method === payment_entity_1.PaymentMethod.CREDIT_B2B;
        if (method === payment_entity_1.PaymentMethod.PAYPAL) {
            const paypalOrder = await this.paypal.createOrder(amount);
            return this.repo.create({
                orderId,
                method,
                amount,
                status: payment_entity_1.PaymentStatus.PENDING,
                externalReference: paypalOrder.id,
            });
        }
        if (!isManual && !isCredit) {
            throw new common_1.BadRequestException(`Unsupported payment method: ${method}`);
        }
        const saved = await this.repo.create({
            orderId,
            method,
            amount,
            reference,
            status: isCredit ? payment_entity_1.PaymentStatus.VERIFIED : payment_entity_1.PaymentStatus.PENDING,
            verifiedAt: isCredit ? new Date() : undefined,
        });
        if (isCredit) {
            this.events.emit(exports.PAYMENT_VERIFIED_EVENT, { orderId, paymentId: saved.id });
        }
        return saved;
    }
    findByOrder(orderId) {
        return this.repo.findAll({
            where: [{ field: 'orderId', op: '==', value: orderId }],
            orderBy: { field: 'createdAt', direction: 'desc' },
        });
    }
    findById(id) {
        return this.repo.getOrThrow(id, 'Payment not found');
    }
    async verifyManual(id, adminUserId) {
        const payment = await this.findById(id);
        if (!payment_entity_1.MANUAL_RECONCILIATION_METHODS.includes(payment.method)) {
            throw new common_1.BadRequestException('Only manual-reconciliation payments are verified this way');
        }
        const saved = await this.repo.update(id, {
            status: payment_entity_1.PaymentStatus.VERIFIED,
            verifiedByUserId: adminUserId,
            verifiedAt: new Date(),
        });
        this.events.emit(exports.PAYMENT_VERIFIED_EVENT, { orderId: saved.orderId, paymentId: saved.id });
        return saved;
    }
    async reject(id, adminUserId, reason) {
        return this.repo.update(id, {
            status: payment_entity_1.PaymentStatus.REJECTED,
            verifiedByUserId: adminUserId,
            verifiedAt: new Date(),
            rejectionReason: reason,
        });
    }
    async capturePaypal(id) {
        const payment = await this.findById(id);
        if (payment.method !== payment_entity_1.PaymentMethod.PAYPAL || !payment.externalReference) {
            throw new common_1.BadRequestException('This payment is not a PayPal payment');
        }
        const result = await this.paypal.captureOrder(payment.externalReference);
        if (result.status !== 'COMPLETED') {
            throw new common_1.BadRequestException(`PayPal order not completed (status: ${result.status})`);
        }
        const saved = await this.repo.update(id, { status: payment_entity_1.PaymentStatus.VERIFIED, verifiedAt: new Date() });
        this.events.emit(exports.PAYMENT_VERIFIED_EVENT, { orderId: saved.orderId, paymentId: saved.id });
        return saved;
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function, paypal_client_1.PayPalClient,
        event_emitter_1.EventEmitter2])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map