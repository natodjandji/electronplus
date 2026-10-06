import { Module, Provider } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { ApiProfitPlusAdapter } from './adapters/api-profit-plus.adapter';
import { PROFIT_PLUS_ADAPTER } from './adapters/profit-plus-adapter.interface';
import { ErpExportService } from './erp-export.service';
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
// collection (secondStoreProducts) — the two share no config or data (only
// the generic fetchBridge HTTP helper), even though both bridges report the
// same field shape (código, descripción, stock, precio1, precio2). Two
// distinct physical ERP installs, not one system with two endpoints.

// The principal store talks to Profit Plus only through its HTTP bridge
// (profit-plus-bridge-principal). Until PROFIT_PLUS_API_URL/KEY are set the
// adapter reports "not configured" and the erp-sync cron skips quietly.
const adapterProvider: Provider = {
  provide: PROFIT_PLUS_ADAPTER,
  useExisting: ApiProfitPlusAdapter,
};

@Module({
  imports: [ProductsModule, OrdersModule],
  controllers: [ErpSyncController],
  providers: [
    ApiProfitPlusAdapter,
    adapterProvider,
    SyncService,
    ErpExportService,
    ErpSyncEventsListener,
  ],
  exports: [SyncService, ErpExportService],
})
export class ErpSyncModule {}
