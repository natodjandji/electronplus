import { Module } from '@nestjs/common';
import {
  PaymentMethodsController,
  PublicPaymentMethodsController,
} from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';

@Module({
  // The public one first, so GET /payment-methods/public is its route.
  controllers: [PublicPaymentMethodsController, PaymentMethodsController],
  providers: [PaymentMethodsService],
  exports: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
