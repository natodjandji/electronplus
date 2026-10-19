import { Module } from '@nestjs/common';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { UploadsModule } from '../uploads/uploads.module';
import { CasheaClient } from './cashea.client';
import { CasheaController } from './cashea.controller';
import { PaymentsEventsListener } from './payments-events.listener';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayPalClient } from './paypal.client';

@Module({
  imports: [UploadsModule, PaymentMethodsModule],
  controllers: [PaymentsController, CasheaController],
  providers: [PaymentsService, PayPalClient, CasheaClient, PaymentsEventsListener],
  exports: [PaymentsService],
})
export class PaymentsModule {}
