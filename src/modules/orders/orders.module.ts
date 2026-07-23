import { Module } from '@nestjs/common';
import { DiscountCodesModule } from '../discount-codes/discount-codes.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProductsModule } from '../products/products.module';
import { ShippingRatesModule } from '../shipping-rates/shipping-rates.module';
import { OrdersEventsListener } from './orders-events.listener';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [ProductsModule, PaymentsModule, ShippingRatesModule, DiscountCodesModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersEventsListener],
  exports: [OrdersService],
})
export class OrdersModule {}
