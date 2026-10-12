import { Module } from '@nestjs/common';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { ProductsModule } from '../products/products.module';
import { SecondStoreModule } from '../second-store/second-store.module';
import { UsersModule } from '../users/users.module';
import { SalesCartsController } from './sales-carts.controller';
import { SalesCartsService } from './sales-carts.service';
import { SharedQuotesController } from './shared-quotes.controller';

@Module({
  imports: [ProductsModule, UsersModule, ExchangeRateModule, SecondStoreModule],
  controllers: [SalesCartsController, SharedQuotesController],
  providers: [SalesCartsService],
})
export class SalesCartsModule {}
