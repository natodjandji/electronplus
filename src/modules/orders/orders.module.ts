import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ProductsModule } from '../products/products.module';
import { OrdersEventsListener } from './orders-events.listener';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [ProductsModule, PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersEventsListener],
  exports: [OrdersService],
})
export class OrdersModule {}
