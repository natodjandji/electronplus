"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const event_emitter_1 = require("@nestjs/event-emitter");
const schedule_1 = require("@nestjs/schedule");
const env_validation_1 = require("./config/env.validation");
const redis_config_1 = require("./config/redis.config");
const firebase_module_1 = require("./firebase/firebase.module");
const redis_module_1 = require("./redis/redis.module");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const products_module_1 = require("./modules/products/products.module");
const quotes_module_1 = require("./modules/quotes/quotes.module");
const orders_module_1 = require("./modules/orders/orders.module");
const payments_module_1 = require("./modules/payments/payments.module");
const erp_sync_module_1 = require("./modules/erp-sync/erp-sync.module");
const inventory_module_1 = require("./modules/inventory/inventory.module");
const finance_module_1 = require("./modules/finance/finance.module");
const purchase_orders_module_1 = require("./modules/purchase-orders/purchase-orders.module");
const reports_module_1 = require("./modules/reports/reports.module");
const qr_module_1 = require("./modules/qr/qr.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true, validate: env_validation_1.validateEnv }),
            firebase_module_1.FirebaseModule,
            bullmq_1.BullModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    connection: (0, redis_config_1.parseRedisUrl)(config.get('REDIS_URL', { infer: true })),
                }),
            }),
            event_emitter_1.EventEmitterModule.forRoot(),
            schedule_1.ScheduleModule.forRoot(),
            redis_module_1.RedisModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            products_module_1.ProductsModule,
            quotes_module_1.QuotesModule,
            orders_module_1.OrdersModule,
            payments_module_1.PaymentsModule,
            erp_sync_module_1.ErpSyncModule,
            inventory_module_1.InventoryModule,
            finance_module_1.FinanceModule,
            purchase_orders_module_1.PurchaseOrdersModule,
            reports_module_1.ReportsModule,
            qr_module_1.QrModule,
            notifications_module_1.NotificationsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map