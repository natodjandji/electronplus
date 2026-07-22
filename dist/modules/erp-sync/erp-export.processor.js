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
var ErpExportProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErpExportProcessor = exports.ERP_EXPORT_QUEUE = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const orders_service_1 = require("../orders/orders.service");
const profit_plus_adapter_interface_1 = require("./adapters/profit-plus-adapter.interface");
const sync_log_entity_1 = require("./entities/sync-log.entity");
const sync_service_1 = require("./sync.service");
exports.ERP_EXPORT_QUEUE = 'erp-export';
let ErpExportProcessor = ErpExportProcessor_1 = class ErpExportProcessor extends bullmq_1.WorkerHost {
    constructor(adapter, firestore, ordersService, events) {
        super();
        this.adapter = adapter;
        this.ordersService = ordersService;
        this.events = events;
        this.logger = new common_1.Logger(ErpExportProcessor_1.name);
        this.repo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.SYNC_LOGS);
    }
    async process(job) {
        const { orderId } = job.data;
        const log = await this.repo.create({
            direction: sync_log_entity_1.SyncDirection.OUTBOUND,
            status: sync_log_entity_1.SyncStatus.RUNNING,
            startedAt: new Date(),
            reference: orderId,
        });
        try {
            const order = await this.ordersService.findById(orderId);
            await this.adapter.reportSale({
                orderId: order.id,
                customerTaxId: order.shippingTaxId,
                items: order.items.map((item) => ({
                    sku: item.sku,
                    qty: item.qty,
                    unitPrice: item.unitPrice,
                })),
                total: order.totalAmount,
                soldAt: order.createdAt,
            });
            await this.ordersService.markErpExported(orderId);
            await this.repo.update(log.id, {
                status: sync_log_entity_1.SyncStatus.SUCCESS,
                itemsProcessed: order.items.length,
                finishedAt: new Date(),
            });
        }
        catch (error) {
            const message = error.message;
            this.logger.error(`ERP export failed for order ${orderId}`, error);
            await this.ordersService.markErpExported(orderId, message);
            await this.repo.update(log.id, { status: sync_log_entity_1.SyncStatus.ERROR, error: message, finishedAt: new Date() });
            this.events.emit(sync_service_1.ERP_SYNC_ERROR_EVENT, {
                direction: sync_log_entity_1.SyncDirection.OUTBOUND,
                message,
                reference: orderId,
            });
            throw error;
        }
    }
};
exports.ErpExportProcessor = ErpExportProcessor;
exports.ErpExportProcessor = ErpExportProcessor = ErpExportProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(exports.ERP_EXPORT_QUEUE),
    __param(0, (0, common_1.Inject)(profit_plus_adapter_interface_1.PROFIT_PLUS_ADAPTER)),
    __param(1, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Object, Function, orders_service_1.OrdersService,
        event_emitter_1.EventEmitter2])
], ErpExportProcessor);
//# sourceMappingURL=erp-export.processor.js.map