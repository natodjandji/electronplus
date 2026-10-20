import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export class SetPaymentMethodDto {
  /** The configured method's id (payment-methods). It's what tells apart
   * the methods an admin added — Pago Móvil, Binance, cash… all share the
   * "other" type. */
  @ValidateIf((dto: SetPaymentMethodDto) => !dto.expectedPaymentMethod)
  @IsString()
  @MaxLength(100)
  paymentMethodId?: string;

  /** Only the type, as older clients send it. */
  @IsOptional()
  @IsEnum(PaymentMethod)
  expectedPaymentMethod?: PaymentMethod;
}
