import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { SecondStoreController } from './second-store.controller';
import { SecondStoreService } from './second-store.service';

@Module({
  imports: [ProductsModule],
  controllers: [SecondStoreController],
  providers: [SecondStoreService],
  exports: [SecondStoreService],
})
export class SecondStoreModule {}
