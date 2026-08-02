import { BullModule } from '@nestjs/bullmq';
import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/env.validation';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { ApiProfitPlusAdapter } from './adapters/api-profit-plus.adapter';
import { DbProfitPlusAdapter } from './adapters/db-profit-plus.adapter';
import { PROFIT_PLUS_ADAPTER, ProfitPlusAdapter } from './adapters/profit-plus-adapter.interface';
import { ERP_EXPORT_QUEUE, ErpExportProcessor } from './erp-export.processor';
import { ErpSyncController } from './erp-sync.controller';
import { ErpSyncEventsListener } from './erp-sync-events.listener';
import { SyncService } from './sync.service';

// This module only covers the PRINCIPAL store's Profit Plus install (the
// full 6-field sync into the main `products` collection, via
// profit-plus-bridge-principal). The SECUNDARIA store's Profit Plus
// install is a completely separate system with its own bridge
// (profit-plus-bridge-secundaria), its own env vars
// (SECOND_STORE_PROFIT_API_URL/KEY), its own sync engine
// (SecondStoreSyncService in ../second-store/), and its own Firestore
// collection (secondStoreProducts) — the two never share code, config, or
// data, even though both bridges now report the same field shape (código,
// descripción, stock, precio1, precio2). Two distinct physical ERP
// installs, not one system with two endpoints.
const adapterProvider: Provider = {
  provide: PROFIT_PLUS_ADAPTER,
  inject: [ConfigService, DbProfitPlusAdapter, ApiProfitPlusAdapter],
  useFactory: (
    config: ConfigService<EnvConfig, true>,
    db: DbProfitPlusAdapter,
    api: ApiProfitPlusAdapter,
  ): ProfitPlusAdapter => {
    // 'api' (the profit-plus-bridge-principal HTTP bridge) is the only
    // adapter actually wired up to the real integration this app ships —
    // it's also the default, so a fresh deploy that never sets
    // PROFIT_PLUS_ADAPTER waits gracefully (ApiProfitPlusAdapter throws a
    // clear "not configured" error, logged and swallowed by the cron) for
    // real bridge credentials instead of silently doing anything else.
    // There used to be a 'mock' option here that seeded a fake demo
    // catalog — removed after it kept recreating deleted products against
    // the real database every cron tick, which is exactly the kind of
    // silent default this comment is warning against repeating.
    return config.get('PROFIT_PLUS_ADAPTER', { infer: true }) === 'db' ? db : api;
  },
};

@Module({
  imports: [BullModule.registerQueue({ name: ERP_EXPORT_QUEUE }), ProductsModule, OrdersModule],
  controllers: [ErpSyncController],
  providers: [
    DbProfitPlusAdapter,
    ApiProfitPlusAdapter,
    adapterProvider,
    SyncService,
    ErpExportProcessor,
    ErpSyncEventsListener,
  ],
  exports: [SyncService],
})
export class ErpSyncModule {}
