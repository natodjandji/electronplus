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
var SyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = exports.ERP_SYNC_ERROR_EVENT = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const cron_1 = require("cron");
const config_1 = require("@nestjs/config");
const event_emitter_1 = require("@nestjs/event-emitter");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const categories_service_1 = require("../products/categories.service");
const products_service_1 = require("../products/products.service");
const profit_plus_adapter_interface_1 = require("./adapters/profit-plus-adapter.interface");
const sync_log_entity_1 = require("./entities/sync-log.entity");
const INBOUND_CRON_JOB_NAME = 'profit-plus-inbound-sync';
exports.ERP_SYNC_ERROR_EVENT = 'erp.sync.error';
let SyncService = SyncService_1 = class SyncService {
    constructor(adapter, firestore, productsService, categoriesService, schedulerRegistry, config, events) {
        this.adapter = adapter;
        this.productsService = productsService;
        this.categoriesService = categoriesService;
        this.schedulerRegistry = schedulerRegistry;
        this.config = config;
        this.events = events;
        this.logger = new common_1.Logger(SyncService_1.name);
        this.repo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.SYNC_LOGS);
    }
    onModuleInit() {
        const cronExpression = this.config.get('PROFIT_PLUS_SYNC_CRON', { infer: true });
        const job = new cron_1.CronJob(cronExpression, () => {
            this.runInboundSync().catch((error) => this.logger.error('Scheduled inbound sync failed', error));
        });
        this.schedulerRegistry.addCronJob(INBOUND_CRON_JOB_NAME, job);
        job.start();
    }
    async runInboundSync() {
        let log = await this.repo.create({ direction: sync_log_entity_1.SyncDirection.INBOUND, status: sync_log_entity_1.SyncStatus.RUNNING, startedAt: new Date() });
        try {
            const items = await this.adapter.fetchInventory();
            let processed = 0;
            for (const item of items) {
                const category = await this.categoriesService.findOrCreateByCode(item.categoryCode, item.categoryLabel);
                await this.productsService.upsertFromErp({
                    externalId: item.externalId,
                    sku: item.sku,
                    name: item.name,
                    categoryId: category.id,
                    category: { id: category.id, code: category.code, label: category.label },
                    retailPrice: item.retailPrice,
                    wholesalePrice: item.wholesalePrice,
                    cost: item.cost,
                    stock: item.stock,
                    specs: item.specs,
                });
                processed += 1;
            }
            log = await this.repo.update(log.id, { status: sync_log_entity_1.SyncStatus.SUCCESS, itemsProcessed: processed, finishedAt: new Date() });
            return log;
        }
        catch (error) {
            const message = error.message;
            await this.repo.update(log.id, { status: sync_log_entity_1.SyncStatus.ERROR, error: message, finishedAt: new Date() });
            this.events.emit(exports.ERP_SYNC_ERROR_EVENT, {
                direction: sync_log_entity_1.SyncDirection.INBOUND,
                message,
            });
            throw error;
        }
    }
    async getStatus() {
        const [lastInbound, lastOutbound, adapterHealthy] = await Promise.all([
            this.repo.findOne([{ field: 'direction', op: '==', value: sync_log_entity_1.SyncDirection.INBOUND }], {
                field: 'startedAt',
                direction: 'desc',
            }),
            this.repo.findOne([{ field: 'direction', op: '==', value: sync_log_entity_1.SyncDirection.OUTBOUND }], {
                field: 'startedAt',
                direction: 'desc',
            }),
            this.adapter.healthCheck(),
        ]);
        return { lastInbound, lastOutbound, adapterHealthy };
    }
    async getLogs() {
        return this.repo.findAll({ orderBy: { field: 'startedAt', direction: 'desc' }, limit: 50 });
    }
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = SyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(profit_plus_adapter_interface_1.PROFIT_PLUS_ADAPTER)),
    __param(1, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Object, Function, products_service_1.ProductsService,
        categories_service_1.CategoriesService,
        schedule_1.SchedulerRegistry,
        config_1.ConfigService,
        event_emitter_1.EventEmitter2])
], SyncService);
//# sourceMappingURL=sync.service.js.map