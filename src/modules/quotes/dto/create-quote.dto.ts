import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export class CreateQuoteDto {
  @IsString()
  customerName: string;

  @IsOptional()
  @IsString()
  customerTaxId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  expectedPaymentMethod?: PaymentMethod;
}
