import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export class CreatePaymentMethodDto {
  /** Checkout key / doc id — lowercase slug, e.g. "zelle-alt". */
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'id must be a lowercase slug (letters, numbers, hyphens)',
  })
  id: string;

  @IsEnum(PaymentMethod)
  backendMethod: PaymentMethod;

  @IsString()
  label: string;

  @IsArray()
  @IsString({ each: true })
  details: string[];

  @IsBoolean()
  needsReference: boolean;

  @IsBoolean()
  needsProof: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
