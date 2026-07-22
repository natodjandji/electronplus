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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const role_enum_1 = require("../../common/enums/role.enum");
const sync_service_1 = require("../erp-sync/sync.service");
const finance_service_1 = require("../finance/finance.service");
const supplier_payable_entity_1 = require("../finance/entities/supplier-payable.entity");
const inventory_service_1 = require("../inventory/inventory.service");
const stock_alert_entity_1 = require("../inventory/entities/stock-alert.entity");
const products_service_1 = require("../products/products.service");
const notification_entity_1 = require("./entities/notification.entity");
const notifications_gateway_1 = require("./notifications.gateway");
const OPS_ROLES = [role_enum_1.Role.ADMIN, role_enum_1.Role.WAREHOUSE_OPERATOR];
let NotificationsService = class NotificationsService {
    constructor(firestore, gateway) {
        this.gateway = gateway;
        this.repo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.NOTIFICATIONS);
    }
    findForRole(role) {
        return this.repo.findAll({
            where: [{ field: 'targetRoles', op: 'array-contains', value: role }],
            orderBy: { field: 'createdAt', direction: 'desc' },
            limit: 100,
        });
    }
    async markRead(id) {
        await this.repo.update(id, { read: true });
    }
    async create(type, title, message, targetRoles, payload) {
        const notification = await this.repo.create({ type, title, message, targetRoles, payload, read: false });
        this.gateway.broadcastToRoles(targetRoles, 'notification.created', notification);
        return notification;
    }
    async handleStockAlert(payload) {
        const isOut = payload.level === stock_alert_entity_1.StockAlertLevel.OUT;
        await this.create(isOut ? notification_entity_1.NotificationType.OUT_OF_STOCK : notification_entity_1.NotificationType.LOW_STOCK, isOut ? 'Producto agotado' : 'Stock bajo', `${payload.name} (${payload.sku}): ${payload.stock} unidades disponibles`, OPS_ROLES, { ...payload });
    }
    async handleInvoiceDue(payload) {
        const isOverdue = payload.dueStatus === supplier_payable_entity_1.PayableDueStatus.OVERDUE;
        await this.create(isOverdue ? notification_entity_1.NotificationType.INVOICE_OVERDUE : notification_entity_1.NotificationType.INVOICE_DUE_SOON, isOverdue ? 'Factura vencida' : 'Factura por vencer', `${payload.supplierName} · Factura ${payload.invoiceNumber} vence el ${payload.dueDate}`, [role_enum_1.Role.ADMIN], { ...payload });
    }
    async handleErpSyncError(payload) {
        await this.create(notification_entity_1.NotificationType.SYNC_ERROR, 'Error de sincronización con Profit Plus', payload.message, [role_enum_1.Role.ADMIN], {
            ...payload,
        });
    }
    handleStockChanged(payload) {
        this.gateway.broadcastToRoles(OPS_ROLES, 'stock.changed', payload);
    }
};
exports.NotificationsService = NotificationsService;
__decorate([
    (0, event_emitter_1.OnEvent)(inventory_service_1.STOCK_ALERT_RAISED_EVENT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsService.prototype, "handleStockAlert", null);
__decorate([
    (0, event_emitter_1.OnEvent)(finance_service_1.INVOICE_DUE_ALERT_EVENT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsService.prototype, "handleInvoiceDue", null);
__decorate([
    (0, event_emitter_1.OnEvent)(sync_service_1.ERP_SYNC_ERROR_EVENT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsService.prototype, "handleErpSyncError", null);
__decorate([
    (0, event_emitter_1.OnEvent)(products_service_1.STOCK_CHANGED_EVENT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsService.prototype, "handleStockChanged", null);
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function, notifications_gateway_1.NotificationsGateway])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map