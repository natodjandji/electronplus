import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export class CreateQuoteDto {
  @IsString()
  @MaxLength(200)
  customerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerTaxId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  expectedPaymentMethod?: PaymentMethod;
}
