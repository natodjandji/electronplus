import { IsOptional, IsString } from 'class-validator';

export class CreateQuoteDto {
  @IsString()
  customerName: string;

  @IsOptional()
  @IsString()
  customerTaxId?: string;
}
