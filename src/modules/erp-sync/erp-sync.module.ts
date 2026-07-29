import { BullModule } from '@nestjs/bullmq';
import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/env.validation';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { ApiProfitPlusAdapter } from './adapters/api-profit-plus.adapter';
import { DbProfitPlusAdapter } from './adapters/db-profit-plus.adapter';
import { MockProfitPlusAdapter } from './adapters/mock-profit-plus.adapter';
import { PROFIT_PLUS_ADAPTER, ProfitPlusAdapter } from './adapters/profit-plus-adapter.interface';
import { ERP_EXPORT_QUEUE, ErpExportProcessor } from './erp-export.processor';
import { ErpSyncController } from './erp-sync.controller';
import { ErpSyncEventsListener } from './erp-sync-events.listener';
import { SyncService } from './sync.service';

const adapterProvider: Provider = {
  provide: PROFIT_PLUS_ADAPTER,
  inject: [ConfigService, MockProfitPlusAdapter, DbProfitPlusAdapter, ApiProfitPlusAdapter],
  useFactory: (
    config: ConfigService<EnvConfig, true>,
    mock: MockProfitPlusAdapter,
    db: DbProfitPlusAdapter,
    api: ApiProfitPlusAdapter,
  ): ProfitPlusAdapter => {
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

@Module({
  imports: [BullModule.registerQueue({ name: ERP_EXPORT_QUEUE }), ProductsModule, OrdersModule],
  controllers: [ErpSyncController],
  providers: [
    MockProfitPlusAdapter,
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
