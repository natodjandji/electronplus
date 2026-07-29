import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';

/** Lets the order owner change payment method and/or resubmit reference/proof after a rejection. */
export class RetryPaymentDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'paymentProofBase64 must be a base64 image data URI',
  })
  paymentProofBase64?: string;
}
