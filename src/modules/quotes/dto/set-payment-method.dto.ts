import { IsEnum } from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export class SetPaymentMethodDto {
  @IsEnum(PaymentMethod)
  expectedPaymentMethod: PaymentMethod;
}
