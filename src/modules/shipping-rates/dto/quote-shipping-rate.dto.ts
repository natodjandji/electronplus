import { IsString } from 'class-validator';

export class QuoteShippingRateDto {
  @IsString()
  state: string;

  @IsString()
  city: string;
}
