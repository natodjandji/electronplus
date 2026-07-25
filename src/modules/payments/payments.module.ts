import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayPalClient } from './paypal.client';

@Module({
  imports: [UploadsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PayPalClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
