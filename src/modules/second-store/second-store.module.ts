import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { SecondStoreController } from './second-store.controller';
import { SecondStoreIndex } from './second-store-index';
import { SecondStoreService } from './second-store.service';
import { SecondStoreSyncService } from './second-store-sync.service';

@Module({
  imports: [ProductsModule],
  controllers: [SecondStoreController],
  providers: [SecondStoreIndex, SecondStoreService, SecondStoreSyncService],
  exports: [SecondStoreService, SecondStoreSyncService],
})
export class SecondStoreModule {}
