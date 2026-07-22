"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErpSyncModule = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const orders_module_1 = require("../orders/orders.module");
const products_module_1 = require("../products/products.module");
const api_profit_plus_adapter_1 = require("./adapters/api-profit-plus.adapter");
const db_profit_plus_adapter_1 = require("./adapters/db-profit-plus.adapter");
const mock_profit_plus_adapter_1 = require("./adapters/mock-profit-plus.adapter");
const profit_plus_adapter_interface_1 = require("./adapters/profit-plus-adapter.interface");
const erp_export_processor_1 = require("./erp-export.processor");
const erp_sync_controller_1 = require("./erp-sync.controller");
const erp_sync_events_listener_1 = require("./erp-sync-events.listener");
const sync_service_1 = require("./sync.service");
const adapterProvider = {
    provide: profit_plus_adapter_interface_1.PROFIT_PLUS_ADAPTER,
    inject: [config_1.ConfigService, mock_profit_plus_adapter_1.MockProfitPlusAdapter, db_profit_plus_adapter_1.DbProfitPlusAdapter, api_profit_plus_adapter_1.ApiProfitPlusAdapter],
    useFactory: (config, mock, db, api) => {
        switch (config.get('PROFIT_PLUS_ADAPTER', { infer: true })) {
            case 'db':
                return db;
            case 'api':
                return api;
            default:
                return mock;
        }
    },
};
let ErpSyncModule = class ErpSyncModule {
};
exports.ErpSyncModule = ErpSyncModule;
exports.ErpSyncModule = ErpSyncModule = __decorate([
    (0, common_1.Module)({
        imports: [bullmq_1.BullModule.registerQueue({ name: erp_export_processor_1.ERP_EXPORT_QUEUE }), products_module_1.ProductsModule, orders_module_1.OrdersModule],
        controllers: [erp_sync_controller_1.ErpSyncController],
        providers: [
            mock_profit_plus_adapter_1.MockProfitPlusAdapter,
            db_profit_plus_adapter_1.DbProfitPlusAdapter,
            api_profit_plus_adapter_1.ApiProfitPlusAdapter,
            adapterProvider,
            sync_service_1.SyncService,
            erp_export_processor_1.ErpExportProcessor,
            erp_sync_events_listener_1.ErpSyncEventsListener,
        ],
        exports: [sync_service_1.SyncService],
    })
], ErpSyncModule);
//# sourceMappingURL=erp-sync.module.js.map