import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { SecondStoreController } from './second-store.controller';
import { SecondStoreService } from './second-store.service';
import { SecondStoreSyncService } from './second-store-sync.service';

@Module({
  imports: [ProductsModule],
  controllers: [SecondStoreController],
  providers: [SecondStoreService, SecondStoreSyncService],
  exports: [SecondStoreService],
})
export class SecondStoreModule {}
