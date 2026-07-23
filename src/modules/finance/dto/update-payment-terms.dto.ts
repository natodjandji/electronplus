import { IsOptional, IsString } from 'class-validator';

export class UpdatePaymentTermsDto {
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
