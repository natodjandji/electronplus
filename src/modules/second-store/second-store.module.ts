import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { LinkedStockModule } from './linked-stock.module';
import { SecondStoreController } from './second-store.controller';
import { SecondStoreService } from './second-store.service';
import { SecondStoreSyncService } from './second-store-sync.service';

@Module({
  imports: [ProductsModule, LinkedStockModule],
  controllers: [SecondStoreController],
  providers: [SecondStoreService, SecondStoreSyncService],
  exports: [SecondStoreService, SecondStoreSyncService],
})
export class SecondStoreModule {}
