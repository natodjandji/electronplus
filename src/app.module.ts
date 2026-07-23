import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { EnvConfig, validateEnv } from './config/env.validation';
import { parseRedisUrl } from './config/redis.config';
import { FirebaseModule } from './firebase/firebase.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ErpSyncModule } from './modules/erp-sync/erp-sync.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { ReportsModule } from './modules/reports/reports.module';
import { QrModule } from './modules/qr/qr.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ExchangeRateModule } from './modules/exchange-rate/exchange-rate.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    FirebaseModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        connection: parseRedisUrl(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    RedisModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    QuotesModule,
    OrdersModule,
    PaymentsModule,
    ErpSyncModule,
    InventoryModule,
    FinanceModule,
    PurchaseOrdersModule,
    ReportsModule,
    QrModule,
    NotificationsModule,
    ExchangeRateModule,
    PaymentMethodsModule,
  ],
})
export class AppModule {}
