import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EnvConfig, validateEnv } from './config/env.validation';
import { parseRedisUrl } from './config/redis.config';
import { FirebaseModule } from './firebase/firebase.module';
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
import { ShippingRatesModule } from './modules/shipping-rates/shipping-rates.module';
import { DiscountCodesModule } from './modules/discount-codes/discount-codes.module';
import { SecondStoreModule } from './modules/second-store/second-store.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ClientErrorsModule } from './modules/client-errors/client-errors.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global default — 100 requests/min per IP. Individual controllers
    // (e.g. reports, which run full-collection scans) tighten this further
    // with their own @Throttle(...) override.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    FirebaseModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        connection: {
          ...parseRedisUrl(config.get('REDIS_URL', { infer: true })),
          // BullMQ's own requirement (throws on boot without this — blocking
          // commands need unlimited retries, not ioredis's default of 20).
          maxRetriesPerRequest: null,
          // Cloud Run only allocates CPU to a request-handling instance, not
          // continuously — an idle connection's keepalive can silently die
          // between requests, then time out reconnecting on the next one.
          // A shorter connect timeout plus indefinite retry (default
          // retryStrategy: exponential backoff, capped at 2s) means a
          // dropped connection recovers in well under a request's timeout
          // instead of hanging on the default 10s connect attempt.
          connectTimeout: 5_000,
          enableOfflineQueue: true,
        },
      }),
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
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
    ShippingRatesModule,
    DiscountCodesModule,
    SecondStoreModule,
    UploadsModule,
    ClientErrorsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
