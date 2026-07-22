import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayPalClient } from './paypal.client';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PayPalClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
