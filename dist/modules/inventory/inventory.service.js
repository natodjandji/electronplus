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
var InventoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = exports.STOCK_ALERT_RAISED_EVENT = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const event_emitter_1 = require("@nestjs/event-emitter");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const products_service_1 = require("../products/products.service");
const stock_alert_entity_1 = require("./entities/stock-alert.entity");
exports.STOCK_ALERT_RAISED_EVENT = 'stock.alert.raised';
let InventoryService = InventoryService_1 = class InventoryService {
    constructor(firestore, productsService, events, config) {
        this.productsService = productsService;
        this.events = events;
        this.config = config;
        this.logger = new common_1.Logger(InventoryService_1.name);
        this.repo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.STOCK_ALERTS);
    }
    async handleStockChanged(payload) {
        const threshold = payload.minStockThreshold ?? this.config.get('LOW_STOCK_DEFAULT_THRESHOLD', { infer: true }) ?? 10;
        const existingActive = await this.repo.findOne([
            { field: 'productId', op: '==', value: payload.productId },
            { field: 'active', op: '==', value: true },
        ]);
        if (payload.stock > threshold) {
            if (existingActive) {
                await this.repo.update(existingActive.id, { active: false, resolvedAt: new Date() });
            }
            return;
        }
        const level = payload.stock === 0 ? stock_alert_entity_1.StockAlertLevel.OUT : stock_alert_entity_1.StockAlertLevel.LOW;
        if (existingActive && existingActive.level === level) {
            await this.repo.update(existingActive.id, { stockAtTrigger: payload.stock });
            return;
        }
        if (existingActive) {
            await this.repo.update(existingActive.id, { active: false, resolvedAt: new Date() });
        }
        const alert = await this.repo.create({
            productId: payload.productId,
            sku: payload.sku,
            name: payload.name,
            level,
            stockAtTrigger: payload.stock,
            threshold,
            active: true,
        });
        this.logger.warn(`Stock alert [${level}] for ${payload.sku}: ${payload.stock} units (threshold ${threshold})`);
        this.events.emit(exports.STOCK_ALERT_RAISED_EVENT, {
            productId: alert.productId,
            sku: alert.sku,
            name: alert.name,
            level: alert.level,
            stock: payload.stock,
        });
    }
    findActiveAlerts() {
        return this.repo.findAll({
            where: [{ field: 'active', op: '==', value: true }],
            orderBy: { field: 'stockAtTrigger', direction: 'asc' },
        });
    }
    stockInWarehouse(warehouseId) {
        return this.productsService.stockInWarehouse(warehouseId);
    }
};
exports.InventoryService = InventoryService;
__decorate([
    (0, event_emitter_1.OnEvent)(products_service_1.STOCK_CHANGED_EVENT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InventoryService.prototype, "handleStockChanged", null);
exports.InventoryService = InventoryService = InventoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function, products_service_1.ProductsService,
        event_emitter_1.EventEmitter2,
        config_1.ConfigService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map